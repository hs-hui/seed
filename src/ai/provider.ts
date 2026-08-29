import { Branch, ConversationEntry, GrowthFocus, SeedState, MaturityDimension, growthFocuses } from '../domain.js';
import { loadConfig, ProviderConfig } from '../storage/store.js';
import { buildContext } from './context-builder.js';
import { getOpenAIToken, openAIAuthFilePath } from './openai-oauth.js';
import { createOpenAIOAuth } from '@openai-oauth/ai-sdk';
import { openaiCredentials } from '@openai-oauth/local';
import { generateText } from 'ai';

export type ProviderLanguage = 'en' | 'ko';
export const DEFAULT_OPENAI_OAUTH_MODEL = 'gpt-5.6-luna';
export type GrowthUpdate = {
  updatedSummary: string;
  questionReason: string;
  contradictionsDetected: string[];
  suggestions: string[];
  maturityDelta: number;
};

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
    const value = (label: string): string => prompt.match(new RegExp(`(?:^|\\n)${label}:([^\\n]*)`))?.[1]?.trim() ?? '';
    if (prompt.includes('GROW_UPDATE')) {
      const coreIdea = value('coreIdea');
      const answer = value('latestAnswer');
      const updatedSummary = `${coreIdea}${answer ? ` — ${answer}` : ''}`.slice(0, 240);
      const maturityDelta = Math.max(1, Math.min(8, Math.ceil(answer.length / 50)));
      const suggestions = answer.length > 160
        ? [this.language === 'ko' ? '첫 버전에서 꼭 필요한 한 가지로 범위를 더 좁혀보세요.' : 'Narrow the first version to one must-have outcome.']
        : [];
      return JSON.stringify({
        updatedSummary,
        questionReason: this.language === 'ko' ? '방금 답변을 현재 아이디어에 반영했습니다.' : 'I folded your answer into the current idea.',
        contradictionsDetected: [], suggestions, maturityDelta,
      });
    }
    const problem = value('problem'); const users = value('users'); const goals = value('goals');
    const constraints = value('constraints'); const assumptions = value('assumptions');
    let focus: GrowthFocus; let question: string;
    if (!users) {
      focus = 'user';
      question = this.language === 'ko' ? '이 아이디어를 가장 먼저 써봤으면 하는 사람은 누구예요?' : 'Who would you most like to try this idea first?';
    } else if (!problem) {
      focus = 'problem';
      question = this.language === 'ko' ? '그 사람이 가장 답답해하는 순간은 언제예요?' : 'When does that person feel the most stuck?';
    } else if (!goals) {
      focus = 'goal';
      question = this.language === 'ko' ? '그 사람이 써보고 나서 “도움이 됐다”라고 느끼려면, 무엇이 달라져야 할까요?' : 'What would need to change for that person to say, “That actually helped”?';
    } else if (!constraints) {
      focus = 'constraint';
      question = this.language === 'ko' ? '처음부터 다 만들 필요는 없어요. 첫 버전에서 꼭 지키고 싶은 범위나 제약은 무엇일까요?' : 'We do not need to build everything at once. What should the first version stay focused on?';
    } else if (!assumptions) {
      focus = 'assumption';
      question = this.language === 'ko' ? '이 아이디어가 잘 되려면 우리가 먼저 확인해야 할 가정은 무엇일까요?' : 'What assumption should we check first for this idea to work?';
    } else {
      focus = 'validation';
      question = this.language === 'ko' ? '이걸 실제로 써본 사람에게 가장 먼저 확인하고 싶은 건 무엇일까요?' : 'What is the first thing you would want to learn from someone using it?';
    }
    return JSON.stringify({ question, maturityDelta: 3, focus });
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

function providerInstructions(language: ProviderLanguage): string {
  return language === 'ko'
    ? 'You are Seed, a careful gardener for ideas. Respond in Korean. Ask one focused question at a time, reflect the user\'s words, identify contradictions politely, and never invent confirmed decisions. Return concise valid JSON when requested.'
    : 'You are Seed, a careful gardener for ideas. Respond in English. Ask one focused question at a time, reflect the user\'s words, identify contradictions politely, and never invent confirmed decisions. Return concise valid JSON when requested.';
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
  // ChatGPT-account OAuth does not expose every Codex model. Older Seed
  // versions suggested gpt-5.3-codex, which the OAuth endpoint rejects with
  // HTTP 400; transparently move that legacy default to a supported model.
  if (useOAuth && resolved.defaultModel === 'gpt-5.3-codex') resolved.defaultModel = DEFAULT_OPENAI_OAUTH_MODEL;
  if (useOAuth) {
    return key ? new OpenAIOAuthProvider(resolved, language) : new LocalProvider(language);
  }
  return key ? new OpenAICompatibleProvider(resolved, key, language) : new LocalProvider(language);
}

export type GrowthSuggestion = { question: string; maturityDelta: number; focus?: GrowthFocus };
function requiredGrowthFocus(seed: SeedState): GrowthFocus {
  if (!seed.users.length) return 'user';
  if (!seed.problem) return 'problem';
  if (!seed.goals.length) return 'goal';
  if (!seed.constraints.length) return 'constraint';
  if (!seed.assumptions.length) return 'assumption';
  return 'validation';
}
function parseJsonObject(response: string): Record<string, unknown> | undefined {
  const trimmed = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { /* try a conversational response */ }
  const start = trimmed.indexOf('{'); const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try { return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>; } catch { return undefined; }
}

export async function nextQuestion(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en', recentConversation: ConversationEntry[] = [], currentBranch?: Branch): Promise<GrowthSuggestion> {
  const provider = await getProvider(providerId, model, language); let response = '';
  try {
    const context = buildContext(seed, 'grow', recentConversation, currentBranch);
    const answeredQuestions = seed.openQuestions.filter((question) => question.status === 'answered').slice(-10).map((question) => question.question).join(' | ');
    const recent = context.recentConversation.map((entry) => `${entry.role}: ${entry.content}`).join(' | ');
    response = await provider.ask(`GROW_QUESTION\nsystem: ${context.systemPrompt}\ncoreIdea: ${context.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${context.currentBranch ? `${context.currentBranch.name} — ${context.currentBranch.summary}` : 'none'}\nconfirmedDecisions: ${context.importantDecisions.map((decision) => decision.decision).join(' | ')}\nopenQuestions: ${context.openQuestions.map((question) => question.question).join(' | ')}\nansweredQuestions: ${answeredQuestions}\nrecentConversation: ${recent}\nAsk exactly one next question about the most useful missing focus. Prioritize missing information in this order: user, problem, goal, constraint, assumption, then validation. Acknowledge the context naturally, avoid survey wording, avoid repeating answered points, and keep it concise (one sentence, no examples, no lists, no “for example”, under 80 characters in Korean or 18 words in English). Use the user's language and do not make decisions for them.\nReturn JSON only: {"question":"one focused question","maturityDelta":1-8,"focus":"user|problem|goal|constraint|assumption|validation"}`);
  } catch {
    response = await new LocalProvider(language).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\nopenQuestions: `);
  }
  const parsed = parseJsonObject(response);
  if (typeof parsed?.question === 'string' && parsed.question.trim()) {
    const parsedDelta = typeof parsed.maturityDelta === 'number' ? parsed.maturityDelta : Number(parsed.maturityDelta);
    const delta = Number.isFinite(parsedDelta) ? parsedDelta : 3;
    const focus = typeof parsed.focus === 'string' && growthFocuses.includes(parsed.focus as GrowthFocus) ? parsed.focus as GrowthFocus : undefined;
    const required = requiredGrowthFocus(seed);
    if (focus !== required) {
      const guided = parseJsonObject(await new LocalProvider(language).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\nopenQuestions: `));
      if (typeof guided?.question === 'string' && guided.question.trim()) return { question: guided.question.trim(), maturityDelta: 3, focus: required };
    }
    return { question: parsed.question.trim(), maturityDelta: Math.max(1, Math.min(8, Math.round(delta))), ...(focus ? { focus } : {}) };
  }
  const fallback = await new LocalProvider(language).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\nopenQuestions: `);
  const local = parseJsonObject(fallback);
  const focus = typeof local?.focus === 'string' && growthFocuses.includes(local.focus as GrowthFocus) ? local.focus as GrowthFocus : undefined;
  return { question: typeof local?.question === 'string' ? local.question : (language === 'ko' ? '이 아이디어를 다음 단계로 발전시키려면 무엇을 먼저 확인해야 하나요?' : 'What should we verify first to move this idea forward?'), maturityDelta: 3, ...(focus ? { focus } : {}) };
}

export async function growthUpdate(seed: SeedState, answer: string, providerId?: string, model?: string, language: ProviderLanguage = 'en', recentConversation: ConversationEntry[] = [], currentBranch?: Branch): Promise<GrowthUpdate> {
  const provider = await getProvider(providerId, model, language);
  const fallback = async (): Promise<GrowthUpdate> => {
    const local = await new LocalProvider(language).ask(`GROW_UPDATE\ncoreIdea: ${seed.coreIdea}\nlatestAnswer: ${answer}`);
    return parseGrowthUpdate(local, seed.coreIdea, answer, language);
  };
  try {
    const context = buildContext(seed, 'grow.update', recentConversation, currentBranch);
    const recent = context.recentConversation.map((entry) => `${entry.role}: ${entry.content}`).join(' | ');
    const response = await provider.ask(`GROW_UPDATE\nsystem: ${context.systemPrompt}\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${context.currentBranch ? `${context.currentBranch.name} — ${context.currentBranch.summary}` : 'none'}\nrecentConversation: ${recent}\nlatestAnswer: ${answer}\nReflect only what the user said. Return valid JSON only: {"updatedSummary":"concise updated idea","questionReason":"why this update matters","contradictionsDetected":["only real contradictions"],"suggestions":["optional next-step suggestions"],"maturityDelta":1-8}`);
    return parseGrowthUpdate(response, seed.coreIdea, answer, language);
  } catch {
    return fallback();
  }
}

function parseGrowthUpdate(response: string, before: string, answer: string, language: ProviderLanguage): GrowthUpdate {
  const parsed = parseJsonObject(response);
  const rawSummary = typeof parsed?.updatedSummary === 'string' ? parsed.updatedSummary : parsed?.summary;
  const updatedSummary = typeof rawSummary === 'string' && rawSummary.trim()
    ? rawSummary.trim().slice(0, 240)
    : `${before} — ${answer.trim()}`.slice(0, 240);
  const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 3) : [];
  const parsedDelta = typeof parsed?.maturityDelta === 'number' ? parsed.maturityDelta : Number(parsed?.maturityDelta);
  const rawDelta = Number.isFinite(parsedDelta) ? parsedDelta : Math.max(1, Math.min(8, Math.ceil(answer.trim().length / 50)));
  return {
    updatedSummary,
    questionReason: typeof parsed?.questionReason === 'string' && parsed.questionReason.trim() ? parsed.questionReason.trim() : language === 'ko' ? '방금 답변을 아이디어에 반영했습니다.' : 'I reflected your answer in the idea.',
    contradictionsDetected: list(parsed?.contradictionsDetected),
    suggestions: list(parsed?.suggestions),
    maturityDelta: Math.max(1, Math.min(8, Math.round(rawDelta))),
  };
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

export function dimensionsFor(seed: SeedState, focus?: GrowthFocus, maturityDelta = 0): MaturityDimension[] {
  const hasProblem = Boolean(seed.problem); const hasUser = seed.users.length > 0; const hasGoals = seed.goals.length > 0; const hasBranch = seed.branches.length > 0;
  const base: Record<string, number> = {
    problem: hasProblem ? 70 : 25,
    user: hasUser ? 70 : 20,
    'core value': hasGoals ? 65 : 30,
    differentiation: hasBranch ? 70 : seed.goals.length > 1 ? 50 : 25,
    scope: seed.prunedItems.length || seed.constraints.length ? 70 : 40,
    feasibility: seed.assumptions.length ? 65 : 45,
    motivation: hasGoals ? 75 : 65,
    confidence: seed.decisions.length || seed.openQuestions.some((question) => question.status === 'answered') ? 55 : 35,
  };
  const focusDimension: Record<GrowthFocus, string> = { user: 'user', problem: 'problem', goal: 'core value', constraint: 'scope', assumption: 'feasibility', validation: 'confidence' };
  const boost = Math.max(0, Math.min(16, Math.round(maturityDelta) * 2));
  return seed.maturityDimensions.map((dimension) => {
    const score = Math.min(100, (base[dimension.name] ?? dimension.score) + (focus && focusDimension[focus] === dimension.name ? boost : 0));
    return { ...dimension, score, reason: score >= 60 ? 'Supported by the current seed state.' : 'Needs another focused growth turn.' };
  });
}

export type MaturityEvaluation = {
  dimensions: MaturityDimension[];
  clear: string[];
  uncertain: string[];
  explore: string[];
};

export async function evaluateMaturity(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<MaturityEvaluation> {
  const fallback = (): MaturityEvaluation => {
    const dimensions = dimensionsFor(seed);
    return {
      dimensions,
      clear: dimensions.filter((dimension) => dimension.score >= 60).map((dimension) => dimension.name),
      uncertain: dimensions.filter((dimension) => dimension.score < 60).map((dimension) => dimension.name),
      explore: seed.openQuestions.filter((question) => question.status === 'open').map((question) => question.question).slice(0, 3),
    };
  };
  const provider = await getProvider(providerId, model, language);
  if (provider.id === 'local') return fallback();
  try {
    const response = await provider.ask(`BLOOM_EVALUATE\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\nopenQuestions: ${seed.openQuestions.filter((question) => question.status === 'open').map((question) => question.question).join(' | ')}\nEvaluate the current idea without inventing facts. Return valid JSON only: {"dimensions":[{"name":"problem","score":0-100,"reason":"brief evidence-based reason"}],"clear":["..."],"uncertain":["..."],"explore":["..."]}. Include all eight dimensions: problem, user, core value, differentiation, scope, feasibility, motivation, confidence.`);
    const parsed = parseJsonObject(response);
    const rawDimensions = Array.isArray(parsed?.dimensions) ? parsed.dimensions : [];
    const dimensions = seed.maturityDimensions.map((dimension) => {
      const candidate = rawDimensions.find((item) => item && typeof item === 'object' && (item as { name?: unknown }).name === dimension.name) as { score?: unknown; reason?: unknown } | undefined;
      const score = Number(candidate?.score);
      return candidate && Number.isFinite(score)
        ? { ...dimension, score: Math.max(0, Math.min(100, Math.round(score))), reason: typeof candidate.reason === 'string' && candidate.reason.trim() ? candidate.reason.trim() : dimension.reason }
        : dimension;
    });
    if (!rawDimensions.length) return fallback();
    const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 5) : [];
    const clear = list(parsed?.clear); const uncertain = list(parsed?.uncertain); const explore = list(parsed?.explore);
    return { dimensions, clear: clear.length ? clear : dimensions.filter((dimension) => dimension.score >= 60).map((dimension) => dimension.name), uncertain: uncertain.length ? uncertain : dimensions.filter((dimension) => dimension.score < 60).map((dimension) => dimension.name), explore: explore.length ? explore : fallback().explore };
  } catch {
    return fallback();
  }
}
