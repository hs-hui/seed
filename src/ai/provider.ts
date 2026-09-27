import { Branch, ConversationEntry, GrowthFocus, ResearchEntry, SeedState, MaturityDimension, growthFocuses } from '../domain.js';
import { loadConfig, ProviderConfig } from '../storage/store.js';
import { buildContext } from './context-builder.js';
import type { ContextExtras } from './context-builder.js';
import { ensureOpenAIAuthFile, getOpenAIToken, openAIAuthFilePath } from './openai-oauth.js';
import { createOpenAIOAuth } from '@openai-oauth/ai-sdk';
import { openaiCredentials } from '@openai-oauth/local';
import { generateText } from 'ai';
import { detectGrowthInputIntent } from './input-intent.js';

export type ProviderLanguage = 'en' | 'ko';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
// Kept as a named alias for callers that specifically configure OAuth.
export const DEFAULT_OPENAI_OAUTH_MODEL = DEFAULT_OPENAI_MODEL;
export type GrowthUpdate = {
  updatedSummary: string;
  questionReason: string;
  contradictionsDetected: string[];
  suggestions: string[];
  maturityDelta: number;
};
export type WaterPerspective = { id: string; name: string; question: string };
export type WaterInsight = { title: string; summary: string; points: string[]; assumptions: string[] };
export type SunlightSource = { source: string; title: string; snippet: string };
export type SunlightArea = { name: string; findings: string[]; facts: string[]; estimates: string[] };
export type SunlightAnalysis = { areas: SunlightArea[]; assumptions: string[]; openQuestions: string[] };
export type EvolutionSuggestion = { name: string; summary: string };
export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ProviderConnection = { success: boolean; latencyMs: number; error?: string };
export type GrowthInputIntent = 'answer' | 'change-question' | 'pause';

/**
 * A one-word acknowledgement is still an answer in a conversational flow.
 * Account-backed models occasionally mistake "응"/"yes" for a request to
 * change the question, so keep these unambiguous short replies deterministic.
 */
function isSimpleAcknowledgement(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase().replace(/[!?.,。！？,]+/g, '').trim();
  return /^(응|네|예|좋아|좋아요|그래|그럼|맞아|맞아요|알겠어|알겠어요|yes|yeah|yep|okay|ok|sure|right|no|아니|아니요|싫어|싫어요|maybe)$/.test(normalized);
}

/**
 * The local provider cannot ask an LLM to judge a meta reply, so keep a small
 * conservative safety net here as well as the richer CLI-side matcher. This
 * prevents callers that use `classifyGrowthInput` directly from storing an
 * obvious help request as product content while preserving normal answers.
 */
function localGrowthInputIntent(value: string): GrowthInputIntent {
  return detectGrowthInputIntent(value);
}
/**
 * UI language and idea language are intentionally separate. English is the
 * CLI default, but a Korean idea should still receive Korean AI content when
 * the user did not add an explicit language flag.
 */
export function inferProviderLanguage(preferred: ProviderLanguage, texts: string[] = []): ProviderLanguage {
  // Prefer a clear signal in the latest user text. This lets a user switch
  // from an English opening to a Korean answer without the earlier English
  // context overpowering the language of the current turn.
  for (const text of [...texts].reverse()) {
    if (!text) continue;
    const korean = (text.match(/[가-힣]/g) ?? []).length;
    const latin = (text.match(/[A-Za-z]/g) ?? []).length;
    if (korean >= 1 && korean >= latin) return 'ko';
    if (latin >= 2 && latin > korean) return 'en';
  }
  const joined = texts.filter(Boolean).join(' ');
  const korean = (joined.match(/[가-힣]/g) ?? []).length;
  const latin = (joined.match(/[A-Za-z]/g) ?? []).length;
  if (korean >= 1 && korean >= latin) return 'ko';
  if (latin >= 2 && latin > korean) return 'en';
  return preferred;
}

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  ask(prompt: string): Promise<string>;
  chat(messages: ProviderMessage[]): Promise<string>;
  stream(prompt: string): AsyncIterable<string>;
  testConnection(): Promise<ProviderConnection>;
  listModels(): Promise<string[]>;
}

/** A deterministic provider used when no credential is configured. */
export class LocalProvider implements LLMProvider {
  readonly id = 'local';
  readonly model = 'rule-based';
  constructor(private readonly language: ProviderLanguage = 'en') {}

  async chat(messages: ProviderMessage[]): Promise<string> { return this.ask(messages.map((message) => `${message.role}: ${message.content}`).join('\n')); }
  async *stream(prompt: string): AsyncIterable<string> { yield await this.ask(prompt); }
  async testConnection(): Promise<ProviderConnection> { return { success: true, latencyMs: 0 }; }
  async listModels(): Promise<string[]> { return [this.model]; }

  async ask(prompt: string): Promise<string> {
    if (prompt.includes('BRANCH_SUGGEST')) {
      return JSON.stringify({ branches: this.language === 'ko' ? [
        { name: '집중 워크플로', summary: '가장 필요한 한 가지부터 해결합니다.' },
        { name: '가이드 경험', summary: '대상 사용자를 위한 단계별 경험으로 발전시킵니다.' },
        { name: '다른 도구와 연결', summary: '핵심 가치를 다른 서비스에서도 쓰게 합니다.' },
      ] : [
        { name: 'Focused workflow', summary: 'Solve one important problem first.' },
        { name: 'Guided experience', summary: 'Guide the first person through a simple step-by-step experience.' },
        { name: 'Tool connection', summary: 'Let other tools use the main benefit later.' },
      ] });
    }
    if (prompt.includes('PRUNE_SUGGEST')) {
      return JSON.stringify({ items: this.language === 'ko' ? [
        { item: '팀 협업', reason: '핵심 사용 흐름이 제대로 되는지 보기 전에 팀 조율까지 넓힙니다.' },
        { item: '모바일 앱', reason: '처음 확인할 때 필요하지 않은 두 번째 화면을 만듭니다.' },
        { item: '고급 연동', reason: '사람들이 실제로 쓰는 핵심 흐름이 자리 잡은 뒤로 미뤄도 됩니다.' },
      ] : [
        { item: 'Team collaboration', reason: 'Adds team coordination before the core workflow is proven.' },
        { item: 'Mobile application', reason: 'Creates a second surface that is not required for the first proof.' },
        { item: 'Advanced integrations', reason: 'Can wait until the main way people use it is useful.' },
      ] });
    }
    const value = (label: string): string => prompt.match(new RegExp(`(?:^|\\n)${label}:([^\\n]*)`))?.[1]?.trim() ?? '';
    const short = (value: string, limit = 54): string => {
      const normalized = value.replace(/\s+/g, ' ').trim();
      if (normalized.length <= limit) return normalized;
      return `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…`;
    };
    const objectForm = (value: string): string => {
      const text = value.trim().replace(/[.!?,。！？]+$/g, '').trim();
      const last = text.codePointAt(text.length - 1);
      if (last === undefined) return text;
      // Hangul syllables encode the final consonant (받침) in the low 5 bits.
      // This keeps local Korean prompts natural without a language package.
      if (last >= 0xac00 && last <= 0xd7a3) return `${text}${(last - 0xac00) % 28 === 0 ? '를' : '을'}`;
      return `${text}을`;
    };
    const seenQuestions = (): string[] => `${value('answeredQuestions')} | ${value('previouslyAskedQuestions')}`
      .split(' | ').map((item) => item.trim()).filter(Boolean);
    const nextUnused = (candidates: string[]): string => candidates.find((candidate) => !seenQuestions().includes(candidate)) ?? candidates[0]!;
    if (prompt.includes('WATER_PERSPECTIVES')) {
      return JSON.stringify({ perspectives: this.language === 'ko' ? [
        { id: 'user', name: '사용자', question: '누가 이 아이디어를 매일 쓰고 싶어 할까요?' },
        { id: 'value', name: '가치', question: '누군가의 행동이나 결과를 어떻게 바꿀까요?' },
        { id: 'technical', name: '첫 단계', question: '처음에는 무엇 하나만 해보면 좋을까요?' },
        { id: 'experience', name: '첫 경험', question: '처음 30초 안에 무엇을 해보게 할까요?' },
      ] : [
        { id: 'user', name: 'User', question: 'Who would want to use this every day?' },
        { id: 'value', name: 'What changes', question: 'What is one thing that should feel different after using it?' },
        { id: 'technical', name: 'First step', question: 'What is one small thing to try first?' },
        { id: 'experience', name: 'First moment', question: 'What should the user do in the first 30 seconds?' },
      ] });
    }
    if (prompt.includes('WATER_DETAIL')) {
      const perspective = value('perspective'); const answer = value('question');
      return JSON.stringify({
        title: perspective,
        summary: this.language === 'ko' ? `${perspective} 관점에서 아이디어를 살펴봤습니다.` : `A first pass through the ${perspective} lens.`,
        points: [answer || (this.language === 'ko' ? '이 관점에서 확인할 점을 한 가지 골라보세요.' : 'Choose one thing to check from this angle.')],
        assumptions: [this.language === 'ko' ? '이 관점의 가치는 실제 사용자 반응으로 확인해야 합니다.' : 'People using it will tell us whether this angle is useful.'],
      });
    }
    if (prompt.includes('SUNLIGHT_ANALYZE')) {
      const idea = value('coreIdea');
      return JSON.stringify({
        areas: this.language === 'ko' ? [
          { name: '사용자', findings: [`${idea}를 실제로 사용할 사람과 현재 대안을 확인해야 합니다.`], facts: [], estimates: ['초기 사용자는 문제를 이미 자주 겪는 사람일 가능성이 있습니다.'] },
          { name: '경쟁과 대안', findings: ['기존 앱·문서·수작업이 어떤 대안으로 쓰이는지 비교해야 합니다.'], facts: [], estimates: ['새 도구가 기존 습관보다 분명히 편해야 전환이 일어납니다.'] },
          { name: '처음 만들기', findings: ['처음 만들 때 필요한 것과 드는 비용을 작게 확인하세요.'], facts: [], estimates: ['작은 시도로 실제로 되는지 먼저 알아볼 수 있습니다.'] },
        ] : [
          { name: 'Users', findings: [`Identify who would use ${idea} and what they use today.`], facts: [], estimates: ['Early adopters are likely to be people who already feel this pain often.'] },
          { name: 'Competition and alternatives', findings: ['Compare existing apps, documents, and manual workarounds.'], facts: [], estimates: ['A new tool must be clearly easier than an existing habit to earn a switch.'] },
          { name: 'First build', findings: ['Check the first version’s needs, daily work, and cost limits.'], facts: [], estimates: ['A small try-out can show whether it is possible.'] },
        ],
        assumptions: this.language === 'ko' ? ['사용자가 현재 방식보다 이 아이디어를 선택할 이유가 있다.'] : ['Users have a reason to choose this over their current approach.'],
        openQuestions: this.language === 'ko' ? ['실제 사용자가 지금 이 문제를 어떻게 해결하고 있나요?'] : ['How do real users solve this problem today?'],
      });
    }
    if (prompt.includes('GROW_QUESTION') && value('currentBranch') !== '' && value('currentBranch') !== 'none') {
      // A branch has its own exploration context rather than a second copy of
      // the parent's user/problem/goal fields. Keep its questions focused on
      // validating that direction so branch growth does not restart the
      // parent's onboarding questionnaire on every turn.
      const branchValue = value('currentBranch');
      const branch = short(branchValue.split(' — ')[0] ?? branchValue);
      const answered = `${value('answeredQuestions')} | ${value('previouslyAskedQuestions')}`.split(' | ').map((item) => item.trim()).filter(Boolean);
      const candidates = this.language === 'ko' ? [
        `${branch}로 누가 어떤 순간에 도움을 받으면 좋을까요?`,
        `${branch}가 도움이 됐다는 걸 어떻게 알 수 있을까요?`,
        `${branch}의 첫 화면에서 꼭 필요한 것은 무엇일까요?`,
        `${branch}를 아주 작게 만들어 먼저 보여준다면 무엇일까요?`,
        `${branch}를 선택한 가장 큰 이유는 무엇인가요?`,
        `${branch}를 써본 사람이 가장 먼저 얻을 결과는 무엇일까요?`,
        `${branch} 대신 사람들이 지금 하는 방법은 무엇인가요?`,
        `${branch}에서 나중으로 미뤄도 되는 것은 무엇일까요?`,
      ] : [
        `What concrete moment should the ${branch} direction solve first?`,
        `What would show that the ${branch} direction works?`,
        `What should the first ${branch} version deliberately leave out?`,
        `What is the smallest version of the ${branch} direction we could try?`,
        `What is the strongest reason to choose the ${branch} direction?`,
        `What outcome would a user expect from the ${branch} direction?`,
        `What alternative do users rely on instead of the ${branch} direction?`,
        `What can the ${branch} direction leave for later?`,
      ];
      const question = candidates.find((candidate) => !answered.includes(candidate)) ?? candidates[0]!;
      return JSON.stringify({ question, maturityDelta: 3, focus: 'validation' });
    }
    if (prompt.includes('EVOLVE_SUGGEST')) {
      return JSON.stringify({ suggestions: this.language === 'ko' ? [
        { name: '더 좁은 첫 경험', summary: '처음 만나는 사람의 문제 하나를 가장 빠르게 해결하는 형태로 발전시킵니다.' },
        { name: '팀 확장', summary: '개인 사용 경험을 팀의 공유·협업 흐름으로 확장합니다.' },
        { name: '다른 도구와 연결', summary: '이미 반응이 좋은 핵심 가치를 다른 도구로 넓혀갑니다.' },
      ] : [
        { name: 'Narrower first experience', summary: 'Build the next version around one important problem.' },
        { name: 'Team expansion', summary: 'Extend the individual experience into a shared team flow.' },
        { name: 'Tool connection', summary: 'Let other tools use the main benefit later.' },
      ] });
    }
    if (prompt.includes('GROW_UPDATE')) {
      const coreIdea = value('coreIdea');
      const originalIdea = value('originalIdea');
      const problem = value('problem');
      const users = value('users').split(',').map((item) => item.trim()).filter(Boolean)[0] ?? '';
      const goal = value('goals').split('|').map((item) => item.trim()).filter(Boolean)[0] ?? '';
      const constraint = value('constraints').split('|').map((item) => item.trim()).filter(Boolean)[0] ?? '';
      const branchContext = value('currentBranch');
      const answer = value('latestAnswer');
      const quotedObject = (text: string): string => {
        const clean = text.replace(/[.!?,。！？]+$/, '').trim();
        return `“${clean}”${objectForm(clean).slice(clean.length)}`;
      };
      const baseSummary = branchContext && branchContext !== 'none'
        ? coreIdea
        : this.language === 'ko' && (users || problem || goal)
          ? `${originalIdea || coreIdea} — ${users ? `${quotedObject(users)} 위한 ` : ''}${problem ? `${quotedObject(problem)} 덜어주고 ` : ''}${goal ? `${quotedObject(goal)} 돕는 ` : ''}${constraint ? `“${constraint}” 중심 ` : ''}아이디어`.replace(/\s+/g, ' ').trim()
          : this.language === 'en' && (users || problem || goal)
            ? `${originalIdea || coreIdea} — ${users ? `for ${users}` : 'for the user'}${problem ? `, helping with “${problem}”` : ''}${goal ? ` to reach “${goal}”` : ''}${constraint ? `; first version: “${constraint}”` : ''}`
            : coreIdea;
      const updatedSummary = `${baseSummary}${answer && !baseSummary.includes(answer) ? ` — ${answer}` : ''}`.slice(0, 240);
      // A useful answer should move the idea by roughly the PRD target of
      // three points per turn; longer answers can earn a little more, but a
      // terse answer must still make visible progress.
      const maturityDelta = Math.max(3, Math.min(8, 2 + Math.ceil(answer.length / 80)));
      const suggestions = answer.length > 160
        ? [this.language === 'ko' ? '첫 버전에서 꼭 필요한 한 가지로 범위를 더 좁혀보세요.' : 'Narrow the first version to one must-have outcome.']
        : [];
      return JSON.stringify({
        updatedSummary,
        questionReason: this.language === 'ko' ? '방금 답변을 현재 아이디어에 반영했습니다.' : 'I folded your answer into the current idea.',
        contradictionsDetected: [], suggestions, maturityDelta,
      });
    }
    const coreIdea = value('coreIdea');
    const originalIdea = value('originalIdea');
    const problem = value('problem'); const users = value('users'); const goals = value('goals');
    const constraints = value('constraints'); const assumptions = value('assumptions');
    let focus: GrowthFocus; let question: string;
    if (!users) {
      focus = 'user';
      question = nextUnused(this.language === 'ko' ? [
        '이 아이디어를 가장 먼저 써봤으면 하는 사람은 누구예요?',
        '처음 도움을 받고 싶은 사람을 한 명만 떠올리면 누구예요?',
        '이 아이디어가 꼭 필요한 사람은 어떤 사람인가요?',
      ] : [
        'Who would you most like to try this idea first?',
        'Who is the first person you want this idea to help?',
        'Who needs this idea most right now?',
      ]);
    } else if (!problem) {
      focus = 'problem';
      question = nextUnused(this.language === 'ko' ? [
        `“${short(users)}”인 사람이 가장 답답하거나 막히는 순간은 언제예요?`,
        `“${short(users)}”인 사람이 자주 포기하게 되는 순간은 언제예요?`,
        `“${short(users)}”인 사람이 지금 가장 불편해하는 일은 무엇인가요?`,
      ] : [
        `What moment is hardest for “${short(users)}”?`,
        `When does “${short(users)}” tend to give up or get stuck?`,
        `What is most frustrating for “${short(users)}” today?`,
      ]);
    } else if (!goals) {
      focus = 'goal';
      question = nextUnused(this.language === 'ko' ? [
        '이 문제를 겪는 사람에게 무엇이 달라지면 도움이 됐다고 느낄까요?',
        '사용자가 오늘 바로 얻었으면 하는 가장 작은 결과는 무엇인가요?',
        '이 아이디어가 잘 작동했다고 느낄 순간은 언제인가요?',
      ] : [
        `What change would make someone in “${short(users)}” say, “That helped”?`,
        'What is the smallest result you want the user to get today?',
        'When would you feel that this idea genuinely worked?',
      ]);
    } else if (!constraints) {
      focus = 'constraint';
      question = nextUnused(this.language === 'ko' ? [
        `${objectForm(short(goals))} 위해 처음에는 무엇 하나만 만들까요?`,
        '처음에는 무엇을 빼도 괜찮을까요?',
        '처음에는 어떤 사람만 도와볼까요?',
      ] : [
        `To reach “${short(goals)}”, what is the one thing to build first?`,
        'What can we leave out at first?',
        'Who should we help first?',
      ]);
    } else if (!assumptions) {
      focus = 'assumption';
      question = nextUnused(this.language === 'ko' ? [
        '처음 써볼 사람에게 무엇을 보여주면 좋을까요?',
        '처음 써볼 때 어떤 행동부터 해보면 좋을까요?',
        '처음 써본 사람에게 어떤 반응을 듣고 싶나요?',
      ] : [
        `With “${short(constraints)}” in mind, what should we try first?`,
        'How could we quickly learn whether this idea works?',
        'What would you like to hear from the first person who tries it?',
      ]);
    } else {
      focus = 'validation';
      const answeredQuestions = `${value('answeredQuestions')} | ${value('previouslyAskedQuestions')}`.split(' | ').map((item) => item.trim()).filter(Boolean);
      const validationQuestions = this.language === 'ko' ? [
        `${objectForm(short(originalIdea || coreIdea))} 써본 사람에게 무엇을 가장 먼저 확인해볼까요?`,
        '이 아이디어가 정말 도움이 됐다는 걸 어떻게 알 수 있을까요?',
        '첫 사용에서 막힐 수 있는 지점은 어디일까요?',
        '써본 뒤 무엇이 달라지면 다시 쓰고 싶을까요?',
        '사람들이 지금은 이 문제를 어떻게 해결하고 있나요?',
        '만들기 전에 가장 먼저 확인해 볼 한 가지는 무엇일까요?',
        '써본 사람이 별로라고 느끼면 무엇을 바꿔볼까요?',
        '만들기 전에 누구에게 어떤 반응을 들어보고 싶나요?',
        '어떤 상황에서 이 아이디어를 가장 먼저 써볼까요?',
        '한 번 써본 사람이 다시 찾게 하려면 무엇이 필요할까요?',
        '이 아이디어가 도움이 되지 않는다면 어떤 이유일까요?',
        '처음으로 도움이 됐다고 느끼기까지 얼마나 빨라야 할까요?',
      ] : [
        `After someone tries “${short(originalIdea || coreIdea)}”, what would you learn first?`,
        'What would show that this idea really helped?',
        'Where might the first user get stuck?',
        'What would make someone want to use it again?',
        'How do people solve this problem today?',
        'Before building, what one thing should we check first?',
        'What result would make you change this idea?',
        'Who could try it before we build more?',
        'In what situation would someone try this first?',
        'What might make someone come back after trying it once?',
        'If this did not help, what might be the reason?',
        'How quickly should someone feel the first useful result?',
      ];
      question = validationQuestions.find((candidate) => !answeredQuestions.includes(candidate)) ?? validationQuestions[0]!;
    }
    return JSON.stringify({ question, maturityDelta: 3, focus });
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

function providerInstructions(language: ProviderLanguage): string {
  return language === 'ko'
    ? 'You are Seed, a careful gardener for ideas. Respond in Korean. The user may be new to software and vibe coding. Ask one easy, focused question at a time, reflect the user\'s words, identify contradictions politely, and never invent confirmed decisions. Avoid jargon such as assumption, validation, scope, signal, feasibility, differentiation, maturity, MVP, persona, roadmap, tech stack, API, backend, frontend, database, deployment, and prototype; explain any needed concept in everyday words. If the user seems confused, treat it as a request for help rather than as idea evidence. Return concise valid JSON when requested.'
    : 'You are Seed, a careful gardener for ideas. Respond in English. The user may be new to software and vibe coding. Ask one easy, focused question at a time, reflect the user\'s words, identify contradictions politely, and never invent confirmed decisions. Avoid jargon such as assumption, validation, scope, signal, feasibility, differentiation, maturity, MVP, persona, roadmap, tech stack, API, backend, frontend, database, deployment, and prototype; explain any needed concept in everyday words. If the user seems confused, treat it as a request for help rather than as idea evidence. Return concise valid JSON when requested.';
}

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
  if (!selected || selected.id === 'local' || selected.enabled === false) return new LocalProvider(language);
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
  if (id && selected.id !== 'local' && !key) throw new Error('provider-credential-missing');
  if (useOAuth) {
    await ensureOpenAIAuthFile();
    return key ? new OpenAIOAuthProvider(resolved, language) : new LocalProvider(language);
  }
  return key ? new OpenAICompatibleProvider(resolved, key, language) : new LocalProvider(language);
}

/**
 * Let a configured model catch conversational intent that cannot be safely
 * enumerated with keyword rules (for example, “I am not sure what you want
 * from me”). Deterministic callers still handle explicit controls first, and
 * a provider failure falls back to the same conservative local safety net.
 */
export async function classifyGrowthInput(
  answer: string,
  question = '',
  providerId?: string,
  model?: string,
  language: ProviderLanguage = 'en',
): Promise<GrowthInputIntent> {
  if (!answer.trim()) return 'pause';
  if (isSimpleAcknowledgement(answer)) return 'answer';
  try {
    const contentLanguage = inferProviderLanguage(language, [answer]);
    const safetyIntent = localGrowthInputIntent(answer);
    const provider = await getProvider(providerId, model, contentLanguage);
    if (provider.id === 'local') return safetyIntent;
    const response = await provider.ask(`GROW_INPUT_CLASSIFY\nquestion: ${question}\nlatestUserText: ${answer}\nClassify only the user's conversational intent. Use "change-question" when they are confused, ask why, ask for an example, say they cannot answer, or want an easier/different question. Use "pause" when they want to stop or return later. Use "answer" only when they provide idea content. Return JSON only: {"intent":"answer|change-question|pause"}`);
    // A malformed/overly chatty model response is still a classification
    // failure, not proof that the text is idea content. Re-run the small local
    // safety net so familiar beginner signals are handled consistently while
    // genuinely unknown text remains an answer.
    const modelIntent = normalizeGrowthInputIntent(response);
    // A model may over-trust a short phrase as idea content. Never let that
    // override a deterministic, obvious request to simplify or change the
    // question; otherwise a beginner's help request would pollute the idea.
    if (safetyIntent !== 'answer' && modelIntent === 'answer') return safetyIntent;
    return modelIntent ?? safetyIntent;
  } catch {
    // If the selected provider is temporarily unavailable, retain the same
    // conservative local safety net. Unknown text still falls through to
    // `answer`, but obvious help/pause requests are never saved as idea data.
    return localGrowthInputIntent(answer);
  }
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

/**
 * Providers are asked for JSON, but account-backed models occasionally return
 * a short label or a one-line explanation instead. Normalize those harmless
 * variations so a formatting hiccup does not turn a help request into idea
 * evidence. Long, unrelated prose is deliberately ignored and lets the
 * caller reuse its local safety net (unknown text remains an `answer`).
 */
function normalizeGrowthInputIntent(response: string): GrowthInputIntent | undefined {
  const parsed = parseJsonObject(response);
  const raw = typeof parsed?.intent === 'string' ? parsed.intent : response;
  const normalized = raw.trim().toLocaleLowerCase().replace(/[_\s]+/g, '-').replace(/["'`.,!?]+/g, '');
  if (['change-question', 'change', 'clarify', 'help', 'rephrase', 'rephrase-question'].includes(normalized)) return 'change-question';
  if (['pause', 'stop', 'later', 'hold', 'pause-for-now'].includes(normalized)) return 'pause';
  if (['answer', 'content', 'idea'].includes(normalized)) return 'answer';

  // Be tolerant of a short natural-language label while avoiding accidental
  // matches in a full model explanation or echoed prompt.
  if (response.trim().length <= 120) {
    if (/(?:change[- ]question|rephrase|clarif|ask[- ]again|질문.{0,8}(?:바꿔|다시|쉽게)|다시 물어)/i.test(response)) return 'change-question';
    if (/(?:\bpause\b|\bstop\b|\blater\b|\bhold\b|나중에|잠깐|멈춰|그만)/i.test(response)) return 'pause';
  }
  return undefined;
}

/** Keep provider output to the one-question conversational contract. */
function sanitizeQuestion(value: string): string {
  const firstLine = value.replace(/\r?\n/g, ' ').replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\s+/g, ' ').trim();
  // Models occasionally prepend a short acknowledgement even when asked for
  // one question. Keep the interrogative sentence itself so the CLI does not
  // turn “좋아요. ...?” into a pseudo-answer followed by a question.
  const questionEnd = firstLine.search(/[?？]/);
  let questionStart = 0;
  let quote: 'ascii' | 'curly' | undefined;
  if (questionEnd >= 0) {
    for (let index = 0; index < questionEnd; index += 1) {
      const character = firstLine[index];
      if (character === '“') quote = 'curly';
      else if (character === '”' && quote === 'curly') quote = undefined;
      else if (character === '"') quote = quote === 'ascii' ? undefined : 'ascii';
      else if (!quote && /[.!。！？]/.test(character ?? '')) questionStart = index + 1;
    }
  }
  const sentence = questionEnd >= 0
    ? firstLine.slice(questionStart, questionEnd + 1).trim()
    : (() => {
    const firstSentence = firstLine.search(/[.!。！？]/);
    const end = firstSentence >= 0 ? firstSentence + 1 : firstLine.length;
    return firstLine.slice(0, end);
  })();
  return sentence.slice(0, 180).trim();
}

function containsBeginnerJargon(value: string, language: ProviderLanguage): boolean {
  const korean = /가정|전제|검증|스코프|시그널|신호|실현\s*가능성|현실성|타당성|차별화|차별성|차별점|경쟁력|경쟁\s*우위|경쟁사|성숙도|리스크|시장\s*(?:규모|조사|성)|수익\s*(?:모델|성)|확장성|우선순위|핵심\s*가설|가치\s*제안|문제\s*정의|실행\s*가능|제약|기술\s*(?:스택|적(?:으로)?\s*가능)|유저\s*플로우|백엔드|프론트엔드|데이터베이스|배포|프로토타입|요구사항|엔드포인트|스키마/i;
  const english = /\b(?:assumption|premise|validat(?:e|ed|ing|ion)|scope|signal|feasibility|viability|differentiation|differentiator|competitive(?:ness|\s+advantage)?|competitor|maturity|risk|market\s+(?:size|research|fit)|revenue\s+model|profitability|scalability|priority|core\s+hypothesis|value\s+proposition|product[- ]market\s+fit|mvp|persona|customer\s+profile|retention|conversion|roadmap|tech(?:nical)?\s+stack|technology|technical(?:ly)?|constraints|user\s+flow|target\s+(?:audience|user)|user\s+segment|customer\s+segment|api|cli|sdk|ui|ux|backend|frontend|database|db|endpoint|token|schema|deploy(?:ment)?|prototype|kpi|integration|requirement(?:s)?)\b/i;
  // Models occasionally answer in the wrong language. Check both vocabularies
  // so a Korean session does not receive an English jargon leak (or vice
  // versa), while keeping the selected language as the primary contract.
  const primary = language === 'ko' ? korean : english;
  const secondary = language === 'ko' ? english : korean;
  return primary.test(value) || secondary.test(value);
}

/** Keep one-question turns short enough for someone new to software. */
function isTooComplexQuestion(value: string, language: ProviderLanguage): boolean {
  const compactLength = value.replace(/\s/g, '').length;
  const characterCount = [...value].length;
  const wordCount = value.split(/\s+/).filter(Boolean).length;
  const connectors = language === 'ko'
    ? (value.match(/그리고|또는|및|하면서|하려면|동시에|와|과/g) ?? []).length
    : (value.match(/\b(?:and|or|while|if|before|after|at the same time)\b/gi) ?? []).length;
  // A short sentence can still be too abstract for a first-time user. These
  // patterns target planning language that asks for a broad judgement instead
  // of one person, moment, action, or result; concrete questions remain valid.
  const abstractKorean = /(?:가장|제일)\s*(?:중요한|큰|위험한|강한)\s*(?:이유|가치|의미|방향|가능성|기준|이점)|(?:어떤|무슨)\s*(?:변화|영향|효과|가치|의미|방향|전략|원칙|기준|차별점|경쟁력|이점|결과)\s*(?:을|를|이|가)?\s*(?:만들|가져|정하|세우|잡|발전|선택|보여)|(?:효과가\s*있다는|잘\s*됐다는|성공했다는)\s*(?:걸|것을|것인지)?\s*어떻게\s*알|(?:계속|더|앞으로)\s*(?:만들|이어갈|할)\s*가치|(?:왜|어째서)\s*(?:이|이런)\s*아이디어가?\s*(?:필요|좋|의미|성공)|(?:장기적으로|앞으로)\s*(?:어떤|무슨)\s*(?:방향|전략|모습)\s*(?:으로|을|를)?\s*(?:발전|정하|만들|가져)|(?:무엇|뭐)를?\s*(?:기준|원칙)으로\s*(?:정하|결정|선택)|(?:만들기|시작하기|사용하기)\s*(?:전에|전).*?(?:무엇|뭐|한\s*가지)/;
  const abstractEnglish = /\b(?:biggest|most important|strongest)\s+(?:reason|value|direction|strategy|principle|opportunity|benefit)|\bwhat\s+(?:broader\s+)?(?:impact|value|meaning|direction|strategy|principle|differentiator|competitive\s+edge|benefit|effect|result)\b|\bwhat\s+criteria\b|\b(?:how|what)\s+(?:would|could)\s+(?:we|i)\s+know\s+(?:this|it)\s+(?:helped|worked|is\s+working)\b|\bwhat\s+would\s+prove\b|\b(?:worth|value\s+of)\s+(?:continuing|building|making)\b|\bwhy\s+(?:should|does)\s+(?:this|the)\s+idea\s+(?:exist|matter|succeed|be\s+built)\b|\bwhat\s+makes\s+(?:this|the)\s+idea\s+(?:special|different|worth\s+building)\b|\bhow\s+should\s+(?:this|the)\s+idea\s+(?:grow|evolve|succeed)\b|\bbefore\s+(?:building|we\s+build|starting)\b.*\bwhat\b.*\b(?:one\s+thing|first)\b|\bwhat\s+should\s+we\s+(?:prioritize|focus\s+on)\b/i;
  // Check both vocabularies because a provider can answer in the wrong
  // language even when the requested content language is clear.
  const abstract = abstractKorean.test(value) || abstractEnglish.test(value);
  return (language === 'ko' ? compactLength > 76 || characterCount >= 80 : wordCount > 18) || connectors >= 2 || abstract;
}

/**
 * Last-resort questions must be safe even if both the model response and the
 * local provider response are malformed. Keep these concrete and tied to the
 * missing focus so a beginner never sees an internal planning term.
 */
function safeQuestionCandidates(language: ProviderLanguage, focus: GrowthFocus): string[] {
  if (language === 'ko') {
    const questions: Record<GrowthFocus, string[]> = {
      user: [
        '처음 이 아이디어를 써볼 사람은 누구예요?',
        '가장 먼저 떠오르는 사용자는 누구예요?',
        '누가 이 아이디어를 가장 반가워할까요?',
        '오늘 이걸 써볼 사람은 누구일까요?',
      ],
      problem: [
        '그 사람이 가장 불편한 순간은 언제예요?',
        '그 사람은 언제 가장 답답해할까요?',
        '무엇 때문에 지금 가장 힘들어하나요?',
        '문제가 가장 크게 느껴지는 때는 언제예요?',
      ],
      goal: [
        '써본 뒤 무엇이 달라지면 좋을까요?',
        '이걸 써서 가장 먼저 얻고 싶은 것은 무엇인가요?',
        '처음 성공했다고 느낄 순간은 언제예요?',
        '한 번 써본 뒤 무엇을 할 수 있으면 좋을까요?',
      ],
      constraint: [
        '처음에는 무엇 하나만 해볼까요?',
        '첫날에는 어디까지 해보면 좋을까요?',
        '처음부터 넣지 않아도 되는 것은 무엇일까요?',
        '가장 작게 시작한다면 무엇을 해볼까요?',
      ],
      assumption: [
        '처음 누구에게 보여보고 어떤 반응을 볼까요?',
        '누구에게 먼저 보여주면 좋을까요?',
        '처음 보여줬을 때 어떤 반응이면 좋을까요?',
        '누가 써보면 이 생각이 괜찮은지 알 수 있을까요?',
      ],
      validation: [
        '써본 사람이 다시 찾을 이유는 무엇일까요?',
        '한 번 써본 뒤 무엇이 기억에 남으면 좋을까요?',
        '계속 쓰고 싶어지는 순간은 언제일까요?',
        '누가 써보고 좋다고 말하면 안심될까요?',
      ],
    };
    return questions[focus];
  }
  const questions: Record<GrowthFocus, string[]> = {
    user: ['Who would try this idea first?', 'Who comes to mind as the first person to use it?', 'Who would be happiest to have this?', 'Who might try it today?'],
    problem: ['When does that person feel most stuck?', 'What moment feels hardest for that person?', 'When does this problem bother them most?', 'What is the most frustrating moment?'],
    goal: ['What should feel different after using it?', 'What is the first useful result you want?', 'When would you feel that it worked?', 'What should someone be able to do after one try?'],
    constraint: ['What one thing should we try first?', 'How far should the first try go?', 'What can we leave out at first?', 'What is the smallest thing to try?'],
    assumption: ['Who could try this first, and what would you ask them?', 'Who could you show this to first?', 'What reaction would make you feel hopeful?', 'Who could tell you whether this idea makes sense?'],
    validation: ['What would make someone come back to it?', 'What should stick with someone after one try?', 'When would someone want to keep using it?', 'Whose positive reaction would reassure you?'],
  };
  return questions[focus];
}

function safeQuestionFor(language: ProviderLanguage, focus: GrowthFocus): string {
  return safeQuestionCandidates(language, focus)[0]!;
}

function unusedSafeQuestion(language: ProviderLanguage, focus: GrowthFocus, seenQuestions: string[]): string {
  const seen = new Set(seenQuestions.map((question) => sanitizeQuestion(question).toLocaleLowerCase()).filter(Boolean));
  const candidate = safeQuestionCandidates(language, focus).find((question) => !seen.has(question.toLocaleLowerCase()));
  if (candidate) return candidate;
  // A very long session can exhaust the focus-specific pool. Keep asking a
  // concrete question rather than repeating the first fallback forever.
  const generic = language === 'ko'
    ? ['지금 떠오르는 한 가지를 말해볼까요?', '아주 작은 답 하나만 골라볼까요?', '가장 먼저 생각나는 것을 말해볼까요?']
    : ['What is one thing that comes to mind?', 'What is one small answer you can choose?', 'What comes to mind first?'];
  const genericCandidate = generic.find((question) => !seen.has(question.toLocaleLowerCase()));
  if (genericCandidate) return genericCandidate;
  const base = language === 'ko' ? '지금 떠오르는 한 가지를 말해볼까요?' : 'What is one thing that comes to mind?';
  for (let index = 2; index <= 100; index += 1) {
    const numbered = language === 'ko' ? `${base.slice(0, -1)} (${index})?` : `${base.slice(0, -1)} (${index})?`;
    if (!seen.has(numbered.toLocaleLowerCase())) return numbered;
  }
  return safeQuestionFor(language, focus);
}

function isSafeQuestion(value: string, answeredQuestions: string, previouslyAskedQuestions: string, language: ProviderLanguage, allSeenQuestions: string[] = []): boolean {
  const normalized = sanitizeQuestion(value);
  if (!normalized || containsBeginnerJargon(normalized, language) || isTooComplexQuestion(normalized, language)) return false;
  const seen = [...`${answeredQuestions} | ${previouslyAskedQuestions}`.split(' | '), ...allSeenQuestions]
    .map((item) => sanitizeQuestion(item).toLocaleLowerCase()).filter(Boolean);
  return !seen.includes(normalized.toLocaleLowerCase());
}

/**
 * Validate a question already persisted by an older Seed run. A pending
 * question bypasses the provider-generation path, so it needs the same
 * beginner-language guard when a user resumes after an upgrade.
 */
export function isBeginnerFriendlyQuestion(value: string, language: ProviderLanguage): boolean {
  const normalized = sanitizeQuestion(value);
  return Boolean(normalized)
    && !containsBeginnerJargon(value, language)
    && !isTooComplexQuestion(value, language)
    && !containsBeginnerJargon(normalized, language)
    && !isTooComplexQuestion(normalized, language);
}

/**
 * Keep model-written post-turn guidance as approachable as the next question.
 * Feedback is not always phrased with a question mark, so apply the same
 * jargon/complexity checks to short guidance sentences before they reach the
 * terminal. Empty guidance is fine; the user should never have to decode a
 * planning phrase just because a provider returned one.
 */
function isBeginnerFriendlyFeedback(value: string, language: ProviderLanguage): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return Boolean(normalized)
    && normalized.length <= (language === 'ko' ? 120 : 180)
    && !containsBeginnerJargon(normalized, language)
    && !isTooComplexQuestion(normalized, language);
}

async function askConversational(
  provider: LLMProvider,
  systemPrompt: string,
  history: ConversationEntry[],
  prompt: string,
): Promise<string> {
  return provider.chat([
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map((entry) => ({ role: entry.role, content: entry.content })),
    { role: 'user', content: prompt },
  ]);
}

export async function nextQuestion(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en', recentConversation: ConversationEntry[] = [], currentBranch?: Branch, contextExtras: ContextExtras = {}, preferSimpleQuestion = false): Promise<GrowthSuggestion> {
  // Only user-authored recent turns can switch the AI content language. An
  // assistant reflection or a branch summary is not a reliable language
  // signal and should not override the idea owner's words.
  const userLanguageSignals = recentConversation.filter((entry) => entry.role === 'user').slice(-6).map((entry) => entry.content);
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, ...userLanguageSignals]);
  const provider = await getProvider(providerId, model, contentLanguage); let response = '';
  const allScopedQuestions = seed.openQuestions.filter((question) => currentBranch ? question.branchId === currentBranch.id : !question.branchId);
  const scopedQuestions = allScopedQuestions.slice(-12);
  // Keep the prompt bounded, but compare against the full question history so
  // a long-running Seed conversation does not quietly repeat an old prompt.
  const allSeenQuestions = allScopedQuestions.map((question) => question.question);
  const answeredQuestions = scopedQuestions
    .filter((question) => question.status === 'answered')
    .map((question) => question.question)
    .join(' | ');
  const previouslyAskedQuestions = scopedQuestions
    .filter((question) => question.status !== 'open')
    .map((question) => question.question)
    .join(' | ');
  try {
    const context = buildContext(seed, 'grow', recentConversation, currentBranch, contextExtras);
    const history = (context.relevantHistory ?? []).map((event) => `${event.type}: ${event.message}`).join(' | ');
    const research = (context.sunlightResearch ?? []).map((entry) => `${entry.title}: ${entry.summary}`).join(' | ');
    const simpleMode = preferSimpleQuestion || contextExtras.preferSimpleQuestion
      ? ' The user found the previous question difficult. Ask an especially easy, concrete question about one person, one situation, one action, or one result; do not ask abstract planning questions and do not use technical or product-planning words.'
      : '';
    const prompt = `GROW_QUESTION\ncoreIdea: ${context.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${context.currentBranch ? `${context.currentBranch.name} — ${context.currentBranch.summary}` : 'none'}\nconfirmedDecisions: ${context.importantDecisions.map((decision) => decision.decision).join(' | ')}\nopenQuestions: ${context.openQuestions.map((question) => question.question).join(' | ')}\nansweredQuestions: ${answeredQuestions}\npreviouslyAskedQuestions: ${previouslyAskedQuestions}\ngrowthHistory: ${history}\nsunlightResearch: ${research}\nAsk exactly one next question about the most useful missing focus. Prioritize missing information in this order: user, problem, goal, constraint, assumption, then validation. Acknowledge the context naturally, avoid survey wording, avoid repeating answered or previously asked points, and keep it concise (one sentence, no examples, no lists, no “for example”, under 80 characters in Korean or 18 words in English). Use plain everyday language for a non-developer: never expose jargon such as assumption, validation, scope, signal, feasibility, differentiation, or maturity. If a concept is needed, explain it with simple words. Use the user's language and do not make decisions for them.${simpleMode}\nReturn JSON only: {"question":"one focused question","maturityDelta":1-8,"focus":"user|problem|goal|constraint|assumption|validation"}`;
    response = await askConversational(provider, context.systemPrompt, context.recentConversation, prompt);
  } catch {
    response = await new LocalProvider(contentLanguage).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${currentBranch ? `${currentBranch.name} — ${currentBranch.summary}` : 'none'}\nopenQuestions: \nansweredQuestions: ${answeredQuestions}\npreviouslyAskedQuestions: ${previouslyAskedQuestions}\ngrowthHistory: ${(contextExtras.relevantHistory ?? []).slice(-12).map((event) => `${event.type}: ${event.message}`).join(' | ')}\nsunlightResearch: ${(contextExtras.sunlightResearch ?? []).slice(-8).map((entry) => `${entry.title}: ${entry.summary}`).join(' | ')}`);
  }
  const parsed = parseJsonObject(response);
  if (typeof parsed?.question === 'string' && parsed.question.trim()) {
    const parsedDelta = typeof parsed.maturityDelta === 'number' ? parsed.maturityDelta : Number(parsed.maturityDelta);
    const delta = Number.isFinite(parsedDelta) ? parsedDelta : 3;
    const focus = typeof parsed.focus === 'string' && growthFocuses.includes(parsed.focus as GrowthFocus) ? parsed.focus as GrowthFocus : undefined;
    const required = currentBranch ? 'validation' : requiredGrowthFocus(seed);
    if (focus !== required) {
      const guided = parseJsonObject(await new LocalProvider(contentLanguage).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${currentBranch ? `${currentBranch.name} — ${currentBranch.summary}` : 'none'}\nopenQuestions: \nansweredQuestions: ${answeredQuestions}\npreviouslyAskedQuestions: ${previouslyAskedQuestions}`));
      if (typeof guided?.question === 'string' && isSafeQuestion(guided.question, answeredQuestions, previouslyAskedQuestions, contentLanguage, allSeenQuestions)) return { question: sanitizeQuestion(guided.question), maturityDelta: 3, focus: required };
      return { question: unusedSafeQuestion(contentLanguage, required, allSeenQuestions), maturityDelta: 3, focus: required };
    }
    const sanitized = sanitizeQuestion(parsed.question);
    const duplicate = allSeenQuestions.map((item) => sanitizeQuestion(item).toLocaleLowerCase()).filter(Boolean).includes(sanitized.toLocaleLowerCase());
    if (duplicate || containsBeginnerJargon(sanitized, contentLanguage) || isTooComplexQuestion(sanitized, contentLanguage)) {
      // A model can repeat an already answered question despite the context
      // instruction or expose internal product jargon despite the prompt.
      // Ask the deterministic conversational fallback for the next unused
      // prompt instead of recording a duplicate or intimidating turn.
      const alternate = parseJsonObject(await new LocalProvider(contentLanguage).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${currentBranch ? `${currentBranch.name} — ${currentBranch.summary}` : 'none'}\nansweredQuestions: ${answeredQuestions}\npreviouslyAskedQuestions: ${previouslyAskedQuestions}`));
      if (typeof alternate?.question === 'string' && isSafeQuestion(alternate.question, answeredQuestions, previouslyAskedQuestions, contentLanguage, allSeenQuestions)) return { question: sanitizeQuestion(alternate.question), maturityDelta: 3, focus: required };
      return { question: unusedSafeQuestion(contentLanguage, required, allSeenQuestions), maturityDelta: 3, focus: required };
    }
    // Keep the state machine deterministic even when a provider omits the
    // optional focus field. The next required focus is the safest label for
    // answer classification and is also useful to callers rendering context.
    return { question: sanitized, maturityDelta: Math.max(1, Math.min(8, Math.round(delta))), focus: focus ?? required };
  }
  const fallback = await new LocalProvider(contentLanguage).ask(`GROW_QUESTION\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${currentBranch ? `${currentBranch.name} — ${currentBranch.summary}` : 'none'}\nopenQuestions: \nansweredQuestions: ${answeredQuestions}\npreviouslyAskedQuestions: ${previouslyAskedQuestions}\ngrowthHistory: ${(contextExtras.relevantHistory ?? []).slice(-12).map((event) => `${event.type}: ${event.message}`).join(' | ')}\nsunlightResearch: ${(contextExtras.sunlightResearch ?? []).slice(-8).map((entry) => `${entry.title}: ${entry.summary}`).join(' | ')}`);
  const local = parseJsonObject(fallback);
  const focus = typeof local?.focus === 'string' && growthFocuses.includes(local.focus as GrowthFocus) ? local.focus as GrowthFocus : undefined;
  const localQuestion = typeof local?.question === 'string' ? sanitizeQuestion(local.question) : '';
  const fallbackFocus = focus ?? requiredGrowthFocus(seed);
  const fallbackQuestion = isSafeQuestion(localQuestion, answeredQuestions, previouslyAskedQuestions, contentLanguage, allSeenQuestions)
    ? localQuestion
    : unusedSafeQuestion(contentLanguage, fallbackFocus, allSeenQuestions);
  return { question: fallbackQuestion, maturityDelta: 3, ...(focus ? { focus } : {}) };
}

export async function growthUpdate(seed: SeedState, answer: string, providerId?: string, model?: string, language: ProviderLanguage = 'en', recentConversation: ConversationEntry[] = [], currentBranch?: Branch, contextExtras: ContextExtras = {}): Promise<GrowthUpdate> {
  const userLanguageSignals = recentConversation.filter((entry) => entry.role === 'user').slice(-6).map((entry) => entry.content);
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, ...userLanguageSignals, answer]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const fallback = async (): Promise<GrowthUpdate> => {
    const local = await new LocalProvider(contentLanguage).ask(`GROW_UPDATE\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\ncurrentBranch: ${currentBranch ? `${currentBranch.name} — ${currentBranch.summary}` : 'none'}\nlatestAnswer: ${answer}`);
    return withLocalContradictions(parseGrowthUpdate(local, seed.coreIdea, answer, contentLanguage), seed, answer, contentLanguage);
  };
  try {
    const context = buildContext(seed, 'grow.update', recentConversation, currentBranch, contextExtras);
    const history = (context.relevantHistory ?? []).map((event) => `${event.type}: ${event.message}`).join(' | ');
    const research = (context.sunlightResearch ?? []).map((entry) => `${entry.title}: ${entry.summary}`).join(' | ');
    const prompt = `GROW_UPDATE\ncoreIdea: ${seed.coreIdea}\noriginalIdea: ${seed.originalIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\ncurrentBranch: ${context.currentBranch ? `${context.currentBranch.name} — ${context.currentBranch.summary}` : 'none'}\ngrowthHistory: ${history}\nsunlightResearch: ${research}\nlatestAnswer: ${answer}\nReflect only what the user said; never turn a request for help, a question about Seed, or uncertainty into a product decision. Keep the updated summary and reason in plain everyday language for a non-developer. Return valid JSON only: {"updatedSummary":"concise updated idea","questionReason":"why this update matters","contradictionsDetected":["only real contradictions"],"suggestions":["optional next-step suggestions"],"maturityDelta":1-8}`;
    const response = await askConversational(provider, context.systemPrompt, context.recentConversation, prompt);
    return withLocalContradictions(parseGrowthUpdate(response, seed.coreIdea, answer, contentLanguage), seed, answer, contentLanguage);
  } catch {
    return fallback();
  }
}

/** Detect only explicit exclusive-scope conflicts; avoid guessing intent. */
function withLocalContradictions(update: GrowthUpdate, seed: SeedState, answer: string, language: ProviderLanguage): GrowthUpdate {
  const existing = [seed.coreIdea, seed.problem, ...seed.goals, ...seed.constraints, ...seed.assumptions].join(' ').toLocaleLowerCase();
  const latest = answer.toLocaleLowerCase();
  const exclusive = (terms: RegExp, marker: RegExp): boolean => marker.test(existing) && terms.test(latest);
  const conflicts: string[] = [];
  if (exclusive(/(?:모바일|mobile|ios|android)/i, /(?:웹|web)\s*(?:만|전용|only)/i)) {
    conflicts.push(language === 'ko' ? '현재 범위는 웹 전용인데, 방금 답변에는 모바일이 포함돼요. 범위를 다시 정할까요?' : 'The current scope is web-only, but this answer introduces mobile. Should we revisit the boundary?');
  }
  if (exclusive(/(?:웹|web)/i, /(?:모바일|mobile|ios|android)\s*(?:만|전용|only)/i)) {
    conflicts.push(language === 'ko' ? '현재 범위는 모바일 전용인데, 방금 답변에는 웹이 포함돼요. 범위를 다시 정할까요?' : 'The current scope is mobile-only, but this answer introduces web. Should we revisit the boundary?');
  }
  if (exclusive(/(?:팀|team|조직|organization)/i, /(?:개인|individual|solo)\s*(?:만|전용|only)/i)) {
    conflicts.push(language === 'ko' ? '개인 전용 범위와 팀 사용이 함께 언급됐어요. 첫 버전의 대상을 다시 정할까요?' : 'The scope says individual-only, but this answer introduces teams. Should we revisit the first audience?');
  }
  if (exclusive(/(?:개인|individual|solo)/i, /(?:팀|team|조직|organization)\s*(?:만|전용|only)/i)) {
    conflicts.push(language === 'ko' ? '팀 전용 범위와 개인 사용이 함께 언급됐어요. 첫 버전의 대상을 다시 정할까요?' : 'The scope says team-only, but this answer introduces individuals. Should we revisit the first audience?');
  }
  return { ...update, contradictionsDetected: [...new Set([...update.contradictionsDetected, ...conflicts])].slice(0, 3) };
}

function parseGrowthUpdate(response: string, before: string, answer: string, language: ProviderLanguage): GrowthUpdate {
  const parsed = parseJsonObject(response);
  const rawSummary = typeof parsed?.updatedSummary === 'string' ? parsed.updatedSummary : parsed?.summary;
  let updatedSummary = typeof rawSummary === 'string' && rawSummary.trim()
    ? rawSummary.trim().slice(0, 240)
    : `${before} — ${answer.trim()}`.slice(0, 240);
  // Keep generated reflections as approachable as generated questions. If a
  // provider leaks product jargon into the summary, fall back to the user's
  // own words instead of making them decode an internal planning label.
  if (containsBeginnerJargon(updatedSummary, language)) {
    updatedSummary = `${before} — ${answer.trim()}`.slice(0, 240);
  }
  // A provider may return a polished but unrelated summary. Preserve the
  // user's latest words so every accepted answer is visible in the state.
  const evidence = answer.trim().split(/\s+/).filter((token) => token.length >= 2).slice(0, 3);
  if (evidence.length && !evidence.some((token) => updatedSummary.toLocaleLowerCase().includes(token.toLocaleLowerCase()))) {
    updatedSummary = `${updatedSummary.slice(0, 160)} — ${answer.trim().slice(0, 75)}`.slice(0, 240);
  }
  const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 3) : [];
  const parsedDelta = typeof parsed?.maturityDelta === 'number' ? parsed.maturityDelta : Number(parsed?.maturityDelta);
  const rawDelta = Number.isFinite(parsedDelta) ? parsedDelta : Math.max(3, Math.min(8, 2 + Math.ceil(answer.trim().length / 80)));
  const rawReason = typeof parsed?.questionReason === 'string' && parsed.questionReason.trim() ? parsed.questionReason.trim() : '';
  const fallbackReason = language === 'ko' ? '방금 답변을 아이디어에 반영했습니다.' : 'I reflected your answer in the idea.';
  return {
    updatedSummary,
    questionReason: rawReason && !containsBeginnerJargon(rawReason, language) ? rawReason : fallbackReason,
    contradictionsDetected: list(parsed?.contradictionsDetected).filter((item) => isBeginnerFriendlyFeedback(item, language)),
    suggestions: list(parsed?.suggestions).filter((suggestion) => isBeginnerFriendlyFeedback(suggestion, language)),
    // Keep the visible progress signal stable across providers. A valid but
    // overly conservative model response should not make a normal growth
    // turn look like it made no progress.
    maturityDelta: Math.max(3, Math.min(8, Math.round(rawDelta))),
  };
}

const defaultWaterPerspectives = (language: ProviderLanguage): WaterPerspective[] => language === 'ko' ? [
  { id: 'user', name: '사용자', question: '누가 이 아이디어를 매일 써볼까요?' },
  { id: 'value', name: '달라지는 점', question: '써본 뒤 무엇이 한 가지 달라지면 좋을까요?' },
  { id: 'technical', name: '첫 단계', question: '처음에는 무엇 하나만 해보면 좋을까요?' },
  { id: 'experience', name: '첫 경험', question: '처음 30초 안에 무엇을 해보게 할까요?' },
] : [
  { id: 'user', name: 'User', question: 'Who would want to use this every day?' },
  { id: 'value', name: 'What changes', question: 'What is one thing that should feel different after using it?' },
  { id: 'technical', name: 'First step', question: 'What is one small thing to try first?' },
  { id: 'experience', name: 'First moment', question: 'What should the user do in the first 30 seconds?' },
];

export async function waterPerspectives(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<WaterPerspective[]> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const fallback = defaultWaterPerspectives(contentLanguage);
  const provider = await getProvider(providerId, model, contentLanguage);
  if (provider.id === 'local') return fallback;
  try {
    const response = await provider.ask(`WATER_PERSPECTIVES\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nProvide at least four distinct lenses (user, value, technical, experience or better). Return valid JSON only: {"perspectives":[{"id":"stable-id","name":"short name","question":"one conversational question"}]}`);
    const parsed = parseJsonObject(response);
    const values = Array.isArray(parsed?.perspectives) ? parsed.perspectives.filter((item): item is { id?: unknown; name?: unknown; question?: unknown } => Boolean(item && typeof item === 'object')) : [];
    const perspectives = values.filter((item) => typeof item.name === 'string' && typeof item.question === 'string').map((item, index) => ({ id: typeof item.id === 'string' && item.id ? item.id : `lens-${index + 1}`, name: item.name as string, question: sanitizeQuestion(item.question as string) })).filter((item) => item.question && !containsBeginnerJargon(`${item.name} ${item.question}`, contentLanguage) && !isTooComplexQuestion(item.question, contentLanguage)).slice(0, 8);
    return perspectives.length >= 4 ? perspectives : fallback;
  } catch { return fallback; }
}

export async function waterInsight(seed: SeedState, perspective: WaterPerspective, providerId?: string, model?: string, language: ProviderLanguage = 'en', userAnswer = ''): Promise<WaterInsight> {
  // Perspective labels are provider-generated content, not user language
  // signals. Keep the seed and optional reflection authoritative here.
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, userAnswer]);
  const fallbackPoints = contentLanguage === 'ko' ? {
    user: '그 사람이 지금 어떻게 하는지 한 가지만 적어보세요.',
    value: '써본 뒤 무엇이 달라지는지 한 가지로 적어보세요.',
    technical: '처음에는 무엇 하나만 해볼지 정해보세요.',
    experience: '처음 30초 안에 무엇을 하게 할지 정해보세요.',
  } : {
    user: 'Name one real situation and the workaround that person uses today.',
    value: 'Describe one thing that should feel different after using it.',
    technical: 'Choose one small thing to try first.',
    experience: 'Choose what the user should do in the first 30 seconds.',
  };
  const fallback: WaterInsight = {
    title: perspective.name,
    summary: contentLanguage === 'ko' ? `${perspective.name} 관점에서 아이디어를 살펴봤습니다.` : `A first pass through the ${perspective.name} lens.`,
    points: [perspective.question, fallbackPoints[perspective.id as keyof typeof fallbackPoints] ?? (contentLanguage === 'ko' ? '이 관점에서 확인할 점을 한 가지 골라보세요.' : 'Choose one thing to check from this angle.')],
    assumptions: [contentLanguage === 'ko' ? '이 관점의 가치는 실제 사용자 반응으로 확인해야 합니다.' : 'People using it will tell us whether this angle is useful.'],
  };
  if (userAnswer.trim()) {
    fallback.summary = contentLanguage === 'ko'
      ? `${perspective.name} 관점에서 "${userAnswer.trim()}"라는 생각을 바탕으로 더 살펴봤습니다.`
      : `The ${perspective.name} lens, building on: "${userAnswer.trim()}".`;
    fallback.points.unshift(userAnswer.trim());
    perspective = { ...perspective, question: `${perspective.question}\nUser reflection: ${userAnswer.trim()}` };
  }
  const provider = await getProvider(providerId, model, contentLanguage);
  if (provider.id === 'local') return fallback;
  try {
    const response = await provider.ask(`WATER_DETAIL\ncoreIdea: ${seed.coreIdea}\nperspective: ${perspective.name}\nquestion: ${perspective.question}\nExplore this lens without inventing facts. Return valid JSON only: {"title":"...","summary":"...","points":["2-4 concrete observations or prompts"],"assumptions":["unverified assumptions"]}`);
    const parsed = parseJsonObject(response);
    const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 6) : [];
    const title = typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallback.title;
    const summary = typeof parsed?.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary;
    const points = list(parsed?.points).filter((point) => !containsBeginnerJargon(point, contentLanguage));
    const assumptions = list(parsed?.assumptions).filter((assumption) => !containsBeginnerJargon(assumption, contentLanguage));
    return {
      title: containsBeginnerJargon(title, contentLanguage) ? fallback.title : title,
      summary: containsBeginnerJargon(summary, contentLanguage) ? fallback.summary : summary,
      points: points.length ? points : fallback.points,
      assumptions: assumptions.length ? assumptions : fallback.assumptions,
    };
  } catch { return fallback; }
}

export async function sunlightAnalysis(seed: SeedState, sources: SunlightSource[] = [], providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<SunlightAnalysis> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const fallback: SunlightAnalysis = {
    areas: contentLanguage === 'ko' ? [
      { name: '사용자', findings: ['누가 이 문제를 실제로 겪는지 확인하세요.'], facts: [], estimates: ['현재 방식보다 분명한 이점이 있어야 전환됩니다.'] },
      { name: '경쟁과 대안', findings: ['기존 제품과 수작업 대안을 비교하세요.'], facts: [], estimates: ['대안의 빈틈이 이 아이디어가 돋보일 기회가 될 수 있습니다.'] },
      { name: '처음 만들기', findings: ['처음 만들 때 필요한 것과 드는 비용을 작게 확인하세요.'], facts: [], estimates: ['작은 시도로 실제로 되는지 먼저 알아볼 수 있습니다.'] },
    ] : [
      { name: 'Users', findings: ['Confirm who experiences this problem in real life.'], facts: [], estimates: ['A switch requires a clear benefit over the current approach.'] },
      { name: 'Competition and alternatives', findings: ['Compare existing products and manual workarounds.'], facts: [], estimates: ['Missing parts may show where this idea could stand out.'] },
      { name: 'First build', findings: ['Check the first version’s needs, daily work, and cost limits.'], facts: [], estimates: ['A small try-out can show whether it is possible.'] },
    ],
    assumptions: contentLanguage === 'ko' ? ['사용자가 현재 방식보다 이 아이디어를 선택할 이유가 있다.'] : ['Users have a reason to choose this over their current approach.'],
    openQuestions: contentLanguage === 'ko' ? ['실제 사용자가 지금 이 문제를 어떻게 해결하고 있나요?'] : ['How do real users solve this problem today?'],
  };
  const provider = await getProvider(providerId, model, contentLanguage);
  if (provider.id === 'local') return fallback;
  try {
    const webContext = sources.map((source) => `${source.title} — ${source.source}: ${source.snippet}`).join(' | ') || 'No web sources; use model knowledge and mark uncertain claims as estimates.';
    const response = await provider.ask(`SUNLIGHT_ANALYZE\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nwebSources: ${webContext}\nAnalyze at least three areas: users, competition/alternatives, and technology/constraints. Separate verified facts from estimates and never invent market numbers. Return valid JSON only: {"areas":[{"name":"...","findings":["..."],"facts":["..."],"estimates":["..."]}],"assumptions":["..."],"openQuestions":["..."]}`);
    const parsed = parseJsonObject(response);
    const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 6) : [];
    const areas = Array.isArray(parsed?.areas) ? parsed.areas.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => ({ name: typeof item.name === 'string' ? item.name.trim() : '', findings: list(item.findings).filter((finding) => !containsBeginnerJargon(finding, contentLanguage)), facts: list(item.facts).filter((fact) => !containsBeginnerJargon(fact, contentLanguage)), estimates: list(item.estimates).filter((estimate) => !containsBeginnerJargon(estimate, contentLanguage)) })).filter((area) => area.name && !containsBeginnerJargon(area.name, contentLanguage) && (area.findings.length || area.facts.length || area.estimates.length)).slice(0, 8) : [];
    if (areas.length < 3) return fallback;
    const assumptions = list(parsed?.assumptions).filter((assumption) => !containsBeginnerJargon(assumption, contentLanguage));
    const openQuestions = list(parsed?.openQuestions).map((question) => sanitizeQuestion(question)).filter((question) => question && !containsBeginnerJargon(question, contentLanguage) && !isTooComplexQuestion(question, contentLanguage));
    return { areas, assumptions, openQuestions };
  } catch { return fallback; }
}

export async function evolutionSuggestions(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<EvolutionSuggestion[]> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const fallback = (contentLanguage === 'ko' ? [
    { name: '더 좁은 첫 경험', summary: '핵심 사용자의 첫 문제 하나를 가장 빠르게 해결하는 형태로 진화합니다.' },
    { name: '팀 확장', summary: '개인 사용 경험을 팀의 공유·협업 흐름으로 확장합니다.' },
    { name: '다른 도구와 연결', summary: '잘 작동하는 핵심 기능을 나중에 다른 도구에서도 쓰게 합니다.' },
  ] : [
    { name: 'Narrower first experience', summary: 'Evolve around solving one core user problem as quickly as possible.' },
    { name: 'Team expansion', summary: 'Extend the individual experience into a shared team workflow.' },
    { name: 'Tool connection', summary: 'Let other tools use the main benefit later.' },
  ]);
  const provider = await getProvider(providerId, model, contentLanguage);
  if (provider.id === 'local') return fallback;
  try {
    const response = await provider.ask(`EVOLVE_SUGGEST\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nSuggest 2-4 genuinely different next-generation directions. Return valid JSON only: {"suggestions":[{"name":"short direction","summary":"why this is a meaningful evolution"}]}`);
    const parsed = parseJsonObject(response);
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => ({ name: typeof item.name === 'string' ? item.name.trim() : '', summary: typeof item.summary === 'string' ? item.summary.trim() : '' })).filter((item) => item.name && item.summary && !containsBeginnerJargon(`${item.name} ${item.summary}`, contentLanguage)).slice(0, 4) : [];
    return suggestions.length >= 2 ? suggestions : fallback;
  } catch { return fallback; }
}

export async function suggestBranches(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ name: string; summary: string }>> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const provider = await getProvider(providerId, model, contentLanguage); let response = '';
  try { response = await provider.ask(`BRANCH_SUGGEST\ncoreIdea: ${seed.coreIdea}\nReturn JSON only: {"branches":[{"name":"short direction","summary":"why it matters"}]}`); } catch { response = await new LocalProvider(contentLanguage).ask('BRANCH_SUGGEST'); }
  const parsed = parseJsonObject(response) as { branches?: Array<{ name: string; summary: string }> } | undefined;
  if (parsed?.branches?.length) {
    const branches = parsed.branches.filter((branch) => branch?.name && branch?.summary && !containsBeginnerJargon(`${branch.name} ${branch.summary}`, contentLanguage)).slice(0, 4);
    if (branches.length >= 2) return branches;
  }
  const fallback = await new LocalProvider(contentLanguage).ask('BRANCH_SUGGEST');
  return (parseJsonObject(fallback) as { branches?: Array<{ name: string; summary: string }> } | undefined)?.branches ?? [];
}

export async function suggestPrune(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ item: string; reason: string }>> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const provider = await getProvider(providerId, model, contentLanguage); let response = '';
  try { response = await provider.ask(`PRUNE_SUGGEST\ncoreIdea: ${seed.coreIdea}\nReturn JSON only: {"items":[{"item":"scope item","reason":"why to defer it"}]}`); } catch { response = await new LocalProvider(contentLanguage).ask('PRUNE_SUGGEST'); }
  const parsed = parseJsonObject(response) as { items?: Array<{ item: string; reason: string }> } | undefined;
  if (parsed?.items?.length) {
    const items = parsed.items.filter((item) => item?.item && item?.reason && !containsBeginnerJargon(`${item.item} ${item.reason}`, contentLanguage));
    if (items.length) return items;
  }
  const fallback = await new LocalProvider(contentLanguage).ask('PRUNE_SUGGEST');
  return (parseJsonObject(fallback) as { items?: Array<{ item: string; reason: string }> } | undefined)?.items ?? [];
}

export function dimensionsFor(seed: SeedState, focus?: GrowthFocus, maturityDelta = 0, language: ProviderLanguage = 'en'): MaturityDimension[] {
  const hasProblem = Boolean(seed.problem); const hasUser = seed.users.length > 0; const hasGoals = seed.goals.length > 0; const hasBranch = seed.branches.length > 0;
  const base: Record<string, number> = {
    // Do not award maturity for information that has not been supplied yet.
    // Small evidence-based floors keep the score readable without making a
    // brand-new idea look half-built during its first Bloom check.
    problem: hasProblem ? 70 : 0,
    user: hasUser ? 70 : 0,
    'core value': hasGoals ? 65 : 0,
    differentiation: hasBranch ? 70 : seed.goals.length > 1 ? 50 : 0,
    scope: seed.prunedItems.length || seed.constraints.length ? 70 : 10,
    feasibility: seed.assumptions.length ? 65 : 10,
    motivation: hasGoals ? 75 : 10,
    confidence: seed.decisions.length || seed.openQuestions.some((question) => question.status === 'answered') ? 55 : 10,
  };
  const focusDimension: Record<GrowthFocus, string> = { user: 'user', problem: 'problem', goal: 'core value', constraint: 'scope', assumption: 'feasibility', validation: 'confidence' };
  const boost = Math.max(0, Math.min(16, Math.round(maturityDelta) * 2));
  const supportedReason = language === 'ko' ? '현재 Seed 상태에서 근거가 확인됩니다.' : 'Supported by the current seed state.';
  const needsReason = language === 'ko' ? '한 번 더 집중해서 성장시켜 보세요.' : 'Needs another focused growth turn.';
  return seed.maturityDimensions.map((dimension) => {
    const evidenceScore = Math.max(base[dimension.name] ?? 0, dimension.score);
    const score = Math.min(100, evidenceScore + (focus && focusDimension[focus] === dimension.name ? boost : 0));
    return { ...dimension, score, reason: score >= 60 ? supportedReason : needsReason };
  });
}

export type MaturityEvaluation = {
  dimensions: MaturityDimension[];
  clear: string[];
  uncertain: string[];
  explore: string[];
};

const maturityDimensionNames = ['problem', 'user', 'core value', 'differentiation', 'scope', 'feasibility', 'motivation', 'confidence'];
function canonicalMaturityDimension(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLocaleLowerCase().replace(/[_-]+/g, ' ');
  return maturityDimensionNames.find((name) => name === normalized);
}

export async function evaluateMaturity(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en', sunlightResearch: ResearchEntry[] = []): Promise<MaturityEvaluation> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals, ...seed.assumptions]);
  const fallback = (): MaturityEvaluation => {
    const dimensions = dimensionsFor(seed, undefined, 0, contentLanguage);
    const open = seed.openQuestions.filter((question) => question.status === 'open').map((question) => question.question).slice(0, 3);
    return {
      dimensions,
      clear: dimensions.filter((dimension) => dimension.score >= 60).map((dimension) => dimension.name),
      uncertain: dimensions.filter((dimension) => dimension.score < 60).map((dimension) => dimension.name),
      explore: open.length ? open : dimensions.filter((dimension) => dimension.score < 60).slice(0, 3).map((dimension) => dimension.name),
    };
  };
  const provider = await getProvider(providerId, model, contentLanguage);
  if (provider.id === 'local') return fallback();
  try {
    const researchContext = sunlightResearch.slice(-8).map((entry) => `${entry.title}: ${entry.summary}`).join(' | ');
    const response = await provider.ask(`BLOOM_EVALUATE\ncoreIdea: ${seed.coreIdea}\nproblem: ${seed.problem}\nusers: ${seed.users.join(', ')}\ngoals: ${seed.goals.join(' | ')}\nconstraints: ${seed.constraints.join(' | ')}\nassumptions: ${seed.assumptions.join(' | ')}\nsunlightResearch: ${researchContext}\nopenQuestions: ${seed.openQuestions.filter((question) => question.status === 'open').map((question) => question.question).join(' | ')}\nEvaluate the current idea without inventing facts. Return valid JSON only: {"dimensions":[{"name":"problem","score":0-100,"reason":"brief evidence-based reason"}],"clear":["..."],"uncertain":["..."],"explore":["..."]}. Include all eight dimensions: problem, user, core value, differentiation, scope, feasibility, motivation, confidence.`);
    const parsed = parseJsonObject(response);
    const rawDimensions = Array.isArray(parsed?.dimensions) ? parsed.dimensions : [];
    const dimensions = seed.maturityDimensions.map((dimension) => {
      const candidate = rawDimensions.find((item) => item && typeof item === 'object' && canonicalMaturityDimension((item as { name?: unknown }).name) === canonicalMaturityDimension(dimension.name)) as { score?: unknown; reason?: unknown } | undefined;
      const score = Number(candidate?.score);
      const reason = typeof candidate?.reason === 'string' && candidate.reason.trim() && !containsBeginnerJargon(candidate.reason, contentLanguage)
        ? candidate.reason.trim() : dimension.reason;
      return candidate && Number.isFinite(score)
        ? { ...dimension, score: Math.max(0, Math.min(100, Math.round(score))), reason }
        : dimension;
    });
    if (!rawDimensions.length) return fallback();
    // Clear/uncertain are dimension buckets, not free-form commentary. Keep
    // only canonical names so a provider's explanatory sentence cannot leak
    // into a localized recommendation as an untranslated label.
    const listDimensions = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => canonicalMaturityDimension(item)).filter((item): item is string => Boolean(item)).slice(0, 5) : [];
    const listExplore = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => canonicalMaturityDimension(item) ?? item.trim()).filter((item) => !containsBeginnerJargon(item, contentLanguage)).slice(0, 5) : [];
    const clear = listDimensions(parsed?.clear); const uncertain = listDimensions(parsed?.uncertain); const explore = listExplore(parsed?.explore);
    return { dimensions, clear: clear.length ? clear : dimensions.filter((dimension) => dimension.score >= 60).map((dimension) => dimension.name), uncertain: uncertain.length ? uncertain : dimensions.filter((dimension) => dimension.score < 60).map((dimension) => dimension.name), explore: explore.length ? explore : fallback().explore };
  } catch {
    return fallback();
  }
}
