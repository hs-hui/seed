import { loadConfig, type ProviderConfig } from '../storage/store.js';
import { ensureOpenAIAuthFile, getOpenAIToken, openAIAuthFilePath } from './openai-oauth.js';
import { createOpenAIOAuth } from '@openai-oauth/ai-sdk';
import { openaiCredentials } from '@openai-oauth/local';
import { generateText } from 'ai';
import type { LLMProvider, ProviderConnection, ProviderLanguage, ProviderMessage } from './contracts.js';
import { providerInstructions } from './prompts/system.js';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
// Kept as a named alias for callers that specifically configure OAuth.
export const DEFAULT_OPENAI_OAUTH_MODEL = DEFAULT_OPENAI_MODEL;

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

function timeoutMs(): number {
  const configured = Number(process.env.SEED_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function retryable(status: number): boolean { return status === 408 || status === 409 || status === 429 || status >= 500; }
async function wait(ms: number): Promise<void> { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function withProviderTimeout<T>(promise: Promise<T>, provider: string): Promise<T> {
  const limit = timeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${provider} request timed out after ${limit}ms.`)), limit);
      promise.then(resolve, reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class ProviderResponseError extends Error {}

async function requestJson<T>(url: string, init: RequestInit, provider: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        const detail = body.slice(0, 500).replace(/\s+/g, ' ').trim();
        const error = new ProviderResponseError(`${provider} request failed (${response.status})${detail ? `: ${detail}` : ''}`);
        if (!retryable(response.status) || attempt === MAX_ATTEMPTS - 1) throw error;
        lastError = error;
      } else {
        try { return (body ? JSON.parse(body) : {}) as T; }
        catch { throw new ProviderResponseError(`${provider} returned invalid JSON.`); }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error(`${provider} request timed out after ${timeoutMs()}ms.`);
      if (error instanceof ProviderResponseError) throw error;
      lastError = error;
      if (attempt === MAX_ATTEMPTS - 1) throw error;
    } finally {
      clearTimeout(timer);
    }
    await wait(250 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error(`${provider} request failed.`);
}

/**
 * Gemini and Anthropic require a user-led, alternating conversation. A Seed
 * session can legitimately begin with an assistant question and can contain
 * adjacent assistant reflections, so normalize only those provider-specific
 * constraints while preserving the actual role boundaries for OpenAI.
 */
function normalizeProviderTurns(messages: ProviderMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const message of messages.filter((entry) => entry.role !== 'system')) {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    if (!turns.length && role === 'assistant') turns.push({ role: 'user', content: '(Seed conversation context)' });
    const previous = turns[turns.length - 1];
    if (previous?.role === role) previous.content = `${previous.content}\n\n${message.content}`;
    else turns.push({ role, content: message.content });
  }
  return turns;
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(public readonly config: ProviderConfig, private readonly apiKey: string, private readonly language: ProviderLanguage = 'en') {}
  get id(): string { return this.config.id; }
  get model(): string { return this.config.defaultModel; }
  /**
   * Preserve roles for a real chat call. The old implementation flattened a
   * conversation into one user prompt, which made follow-up turns lose the
   * distinction between the user's answer and Seed's previous reflection.
   */
  async chat(messages: ProviderMessage[]): Promise<string> {
    if (this.config.type === 'gemini') return this.chatGemini(messages);
    if (this.config.type === 'anthropic') return this.chatAnthropic(messages);
    const base = (this.config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const data = await requestJson<{ choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }>(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.config.defaultModel, ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}), ...(this.config.maxTokens ? { max_tokens: this.config.maxTokens } : {}), messages: [
        { role: 'system', content: providerInstructions(this.language) },
        ...messages.map((message) => ({ role: message.role, content: message.content })),
      ] }),
    }, this.config.name);
    const content = data.choices?.[0]?.message?.content;
    return Array.isArray(content) ? content.map((part) => part.text ?? '').join('') : content ?? '';
  }
  async *stream(prompt: string): AsyncIterable<string> { yield await this.ask(prompt); }
  async testConnection(): Promise<ProviderConnection> {
    const started = Date.now();
    try { const response = await this.ask('Reply with the single word OK.'); if (!response.trim()) throw new Error('provider-empty-response'); return { success: true, latencyMs: Date.now() - started }; }
    catch (error) { return { success: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) }; }
  }
  async listModels(): Promise<string[]> { return [this.model]; }
  async ask(prompt: string): Promise<string> {
    if (this.config.type === 'gemini') return this.askGemini(prompt);
    if (this.config.type === 'anthropic') return this.askAnthropic(prompt);
    const base = (this.config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const data = await requestJson<{ choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }>(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.config.defaultModel, ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}), ...(this.config.maxTokens ? { max_tokens: this.config.maxTokens } : {}), messages: [
        { role: 'system', content: providerInstructions(this.language) },
        { role: 'user', content: prompt },
      ] }),
    }, this.config.name);
    const content = data.choices?.[0]?.message?.content;
    return Array.isArray(content) ? content.map((part) => part.text ?? '').join('') : content ?? '';
  }
  private async askGemini(prompt: string): Promise<string> {
    const base = (this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const endpoint = `${base}/models/${encodeURIComponent(this.config.defaultModel)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const data = await requestJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${providerInstructions(this.language)}\n\n${prompt}` }] }], ...(this.config.temperature !== undefined || this.config.maxTokens ? { generationConfig: { ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}), ...(this.config.maxTokens ? { maxOutputTokens: this.config.maxTokens } : {}) } } : {}) }),
    }, this.config.name);
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  }
  private async chatGemini(messages: ProviderMessage[]): Promise<string> {
    const base = (this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const endpoint = `${base}/models/${encodeURIComponent(this.config.defaultModel)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const system = [providerInstructions(this.language), ...messages.filter((message) => message.role === 'system').map((message) => message.content)].join('\n\n');
    const contents = normalizeProviderTurns(messages).map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
    }));
    const data = await requestJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>(endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, ...(this.config.temperature !== undefined || this.config.maxTokens ? { generationConfig: { ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}), ...(this.config.maxTokens ? { maxOutputTokens: this.config.maxTokens } : {}) } } : {}) }),
    }, this.config.name);
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  }
  private async askAnthropic(prompt: string): Promise<string> {
    const base = (this.config.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
    const data = await requestJson<{ content?: Array<{ text?: string }> }>(`${base}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.config.defaultModel, max_tokens: this.config.maxTokens ?? 1024, ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}), system: providerInstructions(this.language), messages: [{ role: 'user', content: prompt }] }),
    }, this.config.name);
    return data.content?.map((part) => part.text ?? '').join('') ?? '';
  }
  private async chatAnthropic(messages: ProviderMessage[]): Promise<string> {
    const base = (this.config.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
    const system = [providerInstructions(this.language), ...messages.filter((message) => message.role === 'system').map((message) => message.content)].join('\n\n');
    const data = await requestJson<{ content?: Array<{ text?: string }> }>(`${base}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.config.defaultModel, max_tokens: this.config.maxTokens ?? 1024, ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}), system, messages: normalizeProviderTurns(messages).map((message) => ({ role: message.role, content: message.content })) }),
    }, this.config.name);
    return data.content?.map((part) => part.text ?? '').join('') ?? '';
  }
}

/** OpenAI account/Codex access through the local auth file and AI SDK adapter. */
export class OpenAIOAuthProvider implements LLMProvider {
  readonly id = 'openai';
  private readonly client: ReturnType<typeof createOpenAIOAuth>;
  constructor(public readonly config: ProviderConfig, private readonly language: ProviderLanguage = 'en') {
    this.client = createOpenAIOAuth(openaiCredentials({
      authFilePath: openAIAuthFilePath(),
      ensureFresh: true,
      instructions: providerInstructions(language),
    }));
  }
  get model(): string { return this.config.defaultModel; }
  private generationSettings(): { temperature?: number; maxOutputTokens?: number } {
    return {
      ...(this.config.temperature !== undefined ? { temperature: this.config.temperature } : {}),
      ...(this.config.maxTokens ? { maxOutputTokens: this.config.maxTokens } : {}),
    };
  }
  async chat(messages: ProviderMessage[]): Promise<string> {
    const system = [providerInstructions(this.language), ...messages.filter((message) => message.role === 'system').map((message) => message.content)].join('\n\n');
    const result = await withProviderTimeout(generateText({
      model: this.client(this.config.defaultModel),
      system,
      messages: messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: message.content })),
      ...this.generationSettings(),
    }), this.config.name);
    return result.text;
  }
  async *stream(prompt: string): AsyncIterable<string> { yield await this.ask(prompt); }
  async testConnection(): Promise<ProviderConnection> {
    const started = Date.now();
    try { const response = await this.ask('Reply with the single word OK.'); if (!response.trim()) throw new Error('provider-empty-response'); return { success: true, latencyMs: Date.now() - started }; }
    catch (error) { return { success: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) }; }
  }
  async listModels(): Promise<string[]> { return [this.model]; }
  async ask(prompt: string): Promise<string> {
    const result = await withProviderTimeout(generateText({ model: this.client(this.config.defaultModel), system: providerInstructions(this.language), prompt, ...this.generationSettings() }), this.config.name);
    return result.text;
  }
}

export function providerKey(provider: ProviderConfig): string | undefined {
  if (provider.type === 'openai') return process.env.SEED_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (provider.type === 'gemini') return process.env.SEED_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (provider.type === 'anthropic') return process.env.SEED_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  // Custom providers can opt into a namespaced key (for example
  // SEED_OPENROUTER_1_API_KEY) while SEED_API_KEY remains the generic
  // fallback for one-off OpenAI-compatible endpoints.
  const suffix = provider.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return process.env[`SEED_${suffix}_API_KEY`] ?? process.env.SEED_API_KEY;
}

/** Make a minimal real request so configuration never activates a dead provider. */
export async function testProviderConnection(config: ProviderConfig, language: ProviderLanguage = 'en', apiKey?: string): Promise<void> {
  const key = apiKey ?? providerKey(config);
  const oauth = config.type === 'openai' && config.connectionMode === 'oauth';
  // OAuth credentials must come from the Seed/Codex auth file. Do not let an
  // unrelated OPENAI_API_KEY environment variable make an OAuth config look
  // healthy while the account session is actually missing.
  const oauthToken = oauth ? await getOpenAIToken() : undefined;
  const resolved = oauth && config.defaultModel === 'gpt-5.3-codex'
    ? { ...config, defaultModel: DEFAULT_OPENAI_OAUTH_MODEL } : config;
  const client = resolved.type === 'openai' && resolved.connectionMode === 'oauth'
    ? oauthToken ? new OpenAIOAuthProvider(resolved, language) : undefined
    : key ? new OpenAICompatibleProvider(resolved, key, language) : undefined;
  if (!client) throw new Error('provider-credential-missing');
  const result = await client.testConnection();
  if (!result.success) throw new Error(result.error ?? 'provider-connection-failed');
}

export async function getProvider(id?: string, model?: string, language: ProviderLanguage = 'en'): Promise<LLMProvider> {
  const config = await loadConfig();
  const selected = config.providers.find((provider) => provider.id === (id ?? config.activeProvider));
  if (id && !selected) throw new Error(`provider-not-configured:${id}`);
  if (id && selected?.enabled === false) throw new Error(`provider-disabled:${id}`);
  if (!selected || selected.enabled === false) throw new Error('ai-provider-required');
  const useOAuth = selected.type === 'openai' && selected.connectionMode === 'oauth';
  // An OAuth-configured provider must use the account session even when an
  // unrelated OPENAI_API_KEY is present in the shell. API-key mode is an
  // explicit configuration choice, not an implicit fallback.
  const key = useOAuth ? await getOpenAIToken() : providerKey(selected);
  const resolved = {
    ...selected,
    ...(selected.type === 'openai' && process.env.SEED_OPENAI_BASE_URL ? { baseUrl: process.env.SEED_OPENAI_BASE_URL } : {}),
    ...(model ? { defaultModel: model } : selected.type === 'openai' && useOAuth && process.env.SEED_OPENAI_OAUTH_MODEL
      ? { defaultModel: process.env.SEED_OPENAI_OAUTH_MODEL }
      : selected.type === 'openai' && process.env.SEED_OPENAI_MODEL ? { defaultModel: process.env.SEED_OPENAI_MODEL } : {}),
  };
  // ChatGPT-account OAuth does not expose every Codex model. Older Seed
  // versions suggested gpt-5.3-codex, which the OAuth endpoint rejects with
  // HTTP 400; transparently move that legacy default to a supported model.
  if (useOAuth && resolved.defaultModel === 'gpt-5.3-codex') resolved.defaultModel = DEFAULT_OPENAI_OAUTH_MODEL;
  if (id && !key) throw new Error('provider-credential-missing');
  if (useOAuth) {
    await ensureOpenAIAuthFile();
    if (!key) throw new Error('ai-provider-unavailable');
    return new OpenAIOAuthProvider(resolved, language);
  }
  if (!key) throw new Error('ai-provider-unavailable');
  return new OpenAICompatibleProvider(resolved, key, language);
}
