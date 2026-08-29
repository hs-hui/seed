import { SeedState, MaturityDimension } from '../domain.js';
import { loadConfig, ProviderConfig } from '../storage/store.js';
import { buildContext } from './context-builder.js';
import { getOpenAIToken, openAIAuthFilePath } from './openai-oauth.js';
import { createOpenAIOAuth } from '@openai-oauth/ai-sdk';
import { openaiCredentials } from '@openai-oauth/local';
import { generateText } from 'ai';

export type ProviderLanguage = 'en' | 'ko';

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  ask(prompt: string): Promise<string>;
}

/** A deterministic provider used when no credential is configured. */
export class LocalProvider implements LLMProvider {
  readonly id = 'local';
  readonly model = 'rule-based';
  constructor(private readonly language: ProviderLanguage = 'en') {}

  async ask(prompt: string): Promise<string> {
    if (prompt.includes('BRANCH_SUGGEST')) {
      return JSON.stringify({ branches: this.language === 'ko' ? [
        { name: '집중 워크플로', summary: '가장 좁고 가치가 큰 사용 사례부터 해결합니다.' },
        { name: '가이드 경험', summary: '대상 사용자를 위한 단계별 경험으로 발전시킵니다.' },
        { name: '개발자 플랫폼', summary: '핵심 가치를 확장 가능한 도구나 API로 제공합니다.' },
      ] : [
        { name: 'Focused workflow', summary: 'Solve the narrowest, most valuable use case first.' },
        { name: 'Guided experience', summary: 'Turn the idea into a step-by-step experience for the target user.' },
        { name: 'Developer platform', summary: 'Expose the core value as an extensible tool or API.' },
      ] });
    }
    if (prompt.includes('PRUNE_SUGGEST')) {
      return JSON.stringify({ items: this.language === 'ko' ? [
        { item: '팀 협업', reason: '핵심 워크플로가 검증되기 전에 조율 범위를 키웁니다.' },
        { item: '모바일 앱', reason: '첫 번째 검증에 필요하지 않은 두 번째 화면을 만듭니다.' },
        { item: '고급 연동', reason: '주요 사용자 루프가 유용해진 뒤로 미뤄도 됩니다.' },
      ] : [
        { item: 'Team collaboration', reason: 'Adds coordination scope before the core workflow is proven.' },
        { item: 'Mobile application', reason: 'Creates a second surface that is not required for the first proof.' },
        { item: 'Advanced integrations', reason: 'Can wait until the primary user loop is useful.' },
      ] });
    }
    const question = this.language === 'ko'
      ? prompt.includes('problem: \n')
        ? '이 아이디어가 가장 먼저 도와야 할 사람은 누구이며, 그 사람이 겪는 가장 큰 어려움은 무엇인가요?'
        : prompt.includes('openQuestions:') && !prompt.endsWith('openQuestions: ')
          ? '만들기 전에 가장 먼저 답해야 할 미해결 질문은 무엇인가요?'
          : prompt.includes('users: \n')
            ? '이 아이디어의 첫 번째 유용한 버전을 누가 경험해야 하나요?'
            : '사용자가 이 아이디어에서 얻어야 할 다음 구체적인 결과는 무엇인가요?'
      : prompt.includes('problem: \n')
        ? 'Who is the first person this should help, and what is their most painful moment?'
        : prompt.includes('openQuestions:') && !prompt.endsWith('openQuestions: ')
          ? 'Which open question is most important to answer before building?'
          : prompt.includes('users: \n')
            ? 'Who should experience the first useful version of this idea?'
            : 'What is the next concrete outcome a user should get from this idea?';
    return JSON.stringify({ question, maturityDelta: 3 });
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

function providerInstructions(language: ProviderLanguage): string {
  return language === 'ko'
    ? 'You are Seed, a careful gardener for ideas. Respond in Korean. Return concise JSON when requested and never invent confirmed decisions.'
    : 'You are Seed, a careful gardener for ideas. Respond in English. Return concise JSON when requested and never invent confirmed decisions.';
}

function timeoutMs(): number {
  const configured = Number(process.env.SEED_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function retryable(status: number): boolean { return status === 408 || status === 409 || status === 429 || status >= 500; }
async function wait(ms: number): Promise<void> { await new Promise((resolve) => setTimeout(resolve, ms)); }

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

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(public readonly config: ProviderConfig, private readonly apiKey: string, private readonly language: ProviderLanguage = 'en') {}
  get id(): string { return this.config.id; }
  get model(): string { return this.config.defaultModel; }
  async ask(prompt: string): Promise<string> {
    if (this.config.type === 'gemini') return this.askGemini(prompt);
    if (this.config.type === 'anthropic') return this.askAnthropic(prompt);
    const base = (this.config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    const data = await requestJson<{ choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }>(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.config.defaultModel, temperature: 0.7, messages: [
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
      body: JSON.stringify({ contents: [{ parts: [{ text: `${providerInstructions(this.language)}\n\n${prompt}` }] }] }),
    }, this.config.name);
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  }
  private async askAnthropic(prompt: string): Promise<string> {
    const base = (this.config.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/$/, '');
    const data = await requestJson<{ content?: Array<{ text?: string }> }>(`${base}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.config.defaultModel, max_tokens: 1024, system: providerInstructions(this.language), messages: [{ role: 'user', content: prompt }] }),
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
  async ask(prompt: string): Promise<string> {
    const result = await generateText({ model: this.client(this.config.defaultModel), prompt });
    return result.text;
  }
}

export function providerKey(provider: ProviderConfig): string | undefined {
  if (provider.type === 'openai') return process.env.SEED_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (provider.type === 'gemini') return process.env.SEED_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
  if (provider.type === 'anthropic') return process.env.SEED_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  return process.env.SEED_API_KEY;
}

export async function getProvider(id?: string, model?: string, language: ProviderLanguage = 'en'): Promise<LLMProvider> {
  const config = await loadConfig();
  const selected = config.providers.find((provider) => provider.id === (id ?? config.activeProvider));
  if (!selected || selected.id === 'local') return new LocalProvider(language);
  const apiKey = providerKey(selected);
  const useOAuth = selected.type === 'openai' && selected.connectionMode === 'oauth' && !apiKey;
  const key = apiKey ?? (useOAuth ? await getOpenAIToken() : undefined);
  const resolved = {
    ...selected,
    ...(selected.type === 'openai' && process.env.SEED_OPENAI_BASE_URL ? { baseUrl: process.env.SEED_OPENAI_BASE_URL } : {}),
    ...(model ? { defaultModel: model } : selected.type === 'openai' && process.env.SEED_OPENAI_MODEL ? { defaultModel: process.env.SEED_OPENAI_MODEL } : {}),
  };
  if (useOAuth) {
    return key ? new OpenAIOAuthProvider(resolved, language) : new LocalProvider(language);
  }
  return key ? new OpenAICompatibleProvider(resolved, key, language) : new LocalProvider(language);
}

export type GrowthSuggestion = { question: string; maturityDelta: number };
function parseJsonObject(response: string): Record<string, unknown> | undefined {
  const trimmed = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { /* try a conversational response */ }
  const start = trimmed.indexOf('{'); const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try { return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>; } catch { return undefined; }
}

export async function nextQuestion(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<GrowthSuggestion> {
  const provider = await getProvider(providerId, model, language); let response = '';
  try {
    const context = buildContext(seed, 'grow');
    response = await provider.ask(`GROW_QUESTION\ncoreIdea: ${context.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\nconfirmedDecisions: ${context.importantDecisions.map((decision) => decision.decision).join(' | ')}\nopenQuestions: ${context.openQuestions.map((question) => question.question).join(' | ')}\nReturn JSON only: {"question":"one focused question","maturityDelta":1-8}`);
  } catch {
    response = await new LocalProvider(language).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\nopenQuestions: `);
  }
  const parsed = parseJsonObject(response);
  if (typeof parsed?.question === 'string' && parsed.question.trim()) {
    const delta = typeof parsed.maturityDelta === 'number' && Number.isFinite(parsed.maturityDelta) ? parsed.maturityDelta : 3;
    return { question: parsed.question.trim(), maturityDelta: Math.max(1, Math.min(8, Math.round(delta))) };
  }
  const fallback = await new LocalProvider(language).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\nopenQuestions: `);
  const local = parseJsonObject(fallback);
  return { question: typeof local?.question === 'string' ? local.question : (language === 'ko' ? '이 아이디어를 다음 단계로 발전시키려면 무엇을 먼저 확인해야 하나요?' : 'What should we verify first to move this idea forward?'), maturityDelta: 3 };
}

export async function suggestBranches(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ name: string; summary: string }>> {
  const provider = await getProvider(providerId, model, language); let response = '';
  try { response = await provider.ask(`BRANCH_SUGGEST\ncoreIdea: ${seed.coreIdea}\nReturn JSON only: {"branches":[{"name":"short direction","summary":"why it matters"}]}`); } catch { response = await new LocalProvider(language).ask('BRANCH_SUGGEST'); }
  const parsed = parseJsonObject(response) as { branches?: Array<{ name: string; summary: string }> } | undefined;
  if (parsed?.branches?.length) return parsed.branches.filter((branch) => branch?.name && branch?.summary).slice(0, 4);
  const fallback = await new LocalProvider(language).ask('BRANCH_SUGGEST');
  return (parseJsonObject(fallback) as { branches?: Array<{ name: string; summary: string }> } | undefined)?.branches ?? [];
}

export async function suggestPrune(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ item: string; reason: string }>> {
  const provider = await getProvider(providerId, model, language); let response = '';
  try { response = await provider.ask(`PRUNE_SUGGEST\ncoreIdea: ${seed.coreIdea}\nReturn JSON only: {"items":[{"item":"scope item","reason":"why to defer it"}]}`); } catch { response = await new LocalProvider(language).ask('PRUNE_SUGGEST'); }
  const parsed = parseJsonObject(response) as { items?: Array<{ item: string; reason: string }> } | undefined;
  if (parsed?.items?.length) return parsed.items.filter((item) => item?.item && item?.reason);
  const fallback = await new LocalProvider(language).ask('PRUNE_SUGGEST');
  return (parseJsonObject(fallback) as { items?: Array<{ item: string; reason: string }> } | undefined)?.items ?? [];
}

export function dimensionsFor(seed: SeedState): MaturityDimension[] {
  const hasProblem = Boolean(seed.problem); const hasUser = seed.users.length > 0; const hasGoals = seed.goals.length > 0; const hasBranch = seed.branches.length > 0;
  const base: Record<string, number> = { problem: hasProblem ? 70 : 25, user: hasUser ? 70 : 20, 'core value': hasGoals ? 65 : 30, differentiation: hasBranch ? 55 : 25, scope: seed.prunedItems.length ? 70 : 40, feasibility: 45, motivation: 65, confidence: seed.decisions.length ? 65 : 35 };
  return seed.maturityDimensions.map((dimension) => ({ ...dimension, score: base[dimension.name] ?? dimension.score, reason: (base[dimension.name] ?? dimension.score) >= 60 ? 'Supported by the current seed state.' : 'Needs another focused growth turn.' }));
}
