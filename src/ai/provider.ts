import { Branch, ConversationEntry, GrowthFocus, ResearchEntry, SeedState, growthFocuses } from '../domain.js';
export { dimensionsFor } from '../domain/maturity-dimensions.js';
import { buildContext } from './context-builder.js';
import type { ContextExtras } from './context-builder.js';
import { getProvider } from './transport.js';
export { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_OAUTH_MODEL, OpenAICompatibleProvider, OpenAIOAuthProvider, providerKey, testProviderConnection, getProvider } from './transport.js';
import { detectGrowthInputIntent } from './input-intent.js';
import { growthQuestionPrompt, growthUpdatePrompt } from './prompts/growth.js';
import { growthIntentPrompt } from './prompts/system.js';
import { bloomPrompt, branchPrompt, evolutionPrompt, prunePrompt, sunlightPrompt, waterDetailPrompt, waterPerspectivesPrompt } from './prompts/shape.js';
import type { GrowthSuggestion, GrowthUpdate, LLMProvider, MaturityEvaluation, ProviderLanguage } from './contracts.js';
export type { GrowthSuggestion, GrowthUpdate, LLMProvider, MaturityEvaluation, ProviderConnection, ProviderLanguage, ProviderMessage } from './contracts.js';
import { parseJsonObject, normalizeGrowthInputIntent, canonicalMaturityDimension } from './response-parsing.js';
import { sanitizeQuestion, containsBeginnerJargon, isTooComplexQuestion, unusedSafeQuestion, isBeginnerFriendlyQuestion, isBeginnerFriendlyFeedback } from './response-guard.js';
export { isBeginnerFriendlyQuestion } from './response-guard.js';

export type WaterPerspective = { id: string; name: string; question: string };
export type WaterInsight = { title: string; summary: string; points: string[]; assumptions: string[] };
export type SunlightSource = { source: string; title: string; snippet: string };
export type SunlightArea = { name: string; findings: string[]; facts: string[]; estimates: string[] };
export type SunlightAnalysis = { areas: SunlightArea[]; assumptions: string[]; openQuestions: string[] };
export type EvolutionSuggestion = { name: string; summary: string };
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
 * Keep a conservative intent safety net alongside the model classifier. This
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
  const contentLanguage = inferProviderLanguage(language, [answer]);
  const safetyIntent = localGrowthInputIntent(answer);
  const provider = await getProvider(providerId, model, contentLanguage);
  const response = await provider.ask(growthIntentPrompt(question, answer));
  const modelIntent = normalizeGrowthInputIntent(response);
  // A model may over-trust a short phrase as idea content. Never let that
  // override a deterministic, obvious request to simplify or change the
  // question; otherwise a beginner's help request would pollute the idea.
  if (safetyIntent !== 'answer' && modelIntent === 'answer') return safetyIntent;
  return modelIntent ?? safetyIntent;
}

function requiredGrowthFocus(seed: SeedState): GrowthFocus {
  if (!seed.users.length) return 'user';
  if (!seed.problem) return 'problem';
  if (!seed.goals.length) return 'goal';
  if (!seed.constraints.length) return 'constraint';
  if (!seed.assumptions.length) return 'assumption';
  return 'validation';
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
  const context = buildContext(seed, 'grow', recentConversation, currentBranch, contextExtras);
  const prompt = growthQuestionPrompt(seed, context, scopedQuestions, preferSimpleQuestion || Boolean(contextExtras.preferSimpleQuestion));
  response = await askConversational(provider, context.systemPrompt, context.recentConversation, prompt);
  const parsed = parseJsonObject(response);
  const required = currentBranch ? 'validation' : requiredGrowthFocus(seed);
  if (typeof parsed?.question === 'string' && parsed.question.trim()) {
    const parsedDelta = typeof parsed.maturityDelta === 'number' ? parsed.maturityDelta : Number(parsed.maturityDelta);
    const delta = Number.isFinite(parsedDelta) ? parsedDelta : 3;
    const focus = typeof parsed.focus === 'string' && growthFocuses.includes(parsed.focus as GrowthFocus) ? parsed.focus as GrowthFocus : undefined;
    if (focus !== required) {
      return { question: unusedSafeQuestion(contentLanguage, required, allSeenQuestions), maturityDelta: 3, focus: required };
    }
    const sanitized = sanitizeQuestion(parsed.question);
    const duplicate = allSeenQuestions.map((item) => sanitizeQuestion(item).toLocaleLowerCase()).filter(Boolean).includes(sanitized.toLocaleLowerCase());
    if (duplicate || containsBeginnerJargon(sanitized, contentLanguage) || isTooComplexQuestion(sanitized, contentLanguage)) {
      // A model can repeat an already answered question despite the context
      // instruction or expose internal product jargon despite the prompt.
      // Ask a deterministic, unused, beginner-safe question instead of
      // recording a duplicate or intimidating turn.
      return { question: unusedSafeQuestion(contentLanguage, required, allSeenQuestions), maturityDelta: 3, focus: required };
    }
    // Keep the state machine deterministic even when a provider omits the
    // optional focus field. The next required focus is the safest label for
    // answer classification and is also useful to callers rendering context.
    return { question: sanitized, maturityDelta: Math.max(1, Math.min(8, Math.round(delta))), focus: focus ?? required };
  }
  return { question: unusedSafeQuestion(contentLanguage, required, allSeenQuestions), maturityDelta: 3, focus: required };
}

export async function growthUpdate(seed: SeedState, answer: string, providerId?: string, model?: string, language: ProviderLanguage = 'en', recentConversation: ConversationEntry[] = [], currentBranch?: Branch, contextExtras: ContextExtras = {}): Promise<GrowthUpdate> {
  const userLanguageSignals = recentConversation.filter((entry) => entry.role === 'user').slice(-6).map((entry) => entry.content);
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, ...userLanguageSignals, answer]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const context = buildContext(seed, 'grow.update', recentConversation, currentBranch, contextExtras);
  const prompt = growthUpdatePrompt(seed, context, answer);
  const response = await askConversational(provider, context.systemPrompt, context.recentConversation, prompt);
  return withLocalContradictions(parseGrowthUpdate(response, seed.coreIdea, answer, contentLanguage), seed, answer, contentLanguage);
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

export async function waterPerspectives(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<WaterPerspective[]> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const response = await provider.ask(waterPerspectivesPrompt(seed));
  const parsed = parseJsonObject(response);
  const values = Array.isArray(parsed?.perspectives) ? parsed.perspectives.filter((item): item is { id?: unknown; name?: unknown; question?: unknown } => Boolean(item && typeof item === 'object')) : [];
  const perspectives = values.filter((item) => typeof item.name === 'string' && typeof item.question === 'string').map((item, index) => ({ id: typeof item.id === 'string' && item.id ? item.id : `lens-${index + 1}`, name: item.name as string, question: sanitizeQuestion(item.question as string) })).filter((item) => item.question && !containsBeginnerJargon(`${item.name} ${item.question}`, contentLanguage) && !isTooComplexQuestion(item.question, contentLanguage)).slice(0, 8);
  if (perspectives.length < 4) throw new Error('ai-response-invalid');
  return perspectives;
}

export async function waterInsight(seed: SeedState, perspective: WaterPerspective, providerId?: string, model?: string, language: ProviderLanguage = 'en', userAnswer = ''): Promise<WaterInsight> {
  // Perspective labels are provider-generated content, not user language
  // signals. Keep the seed and optional reflection authoritative here.
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, userAnswer]);
  const effectivePerspective = userAnswer.trim()
    ? { ...perspective, question: `${perspective.question}\nUser reflection: ${userAnswer.trim()}` }
    : perspective;
  const provider = await getProvider(providerId, model, contentLanguage);
  const response = await provider.ask(waterDetailPrompt(seed, effectivePerspective));
  const parsed = parseJsonObject(response);
  const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 6) : [];
  const title = typeof parsed?.title === 'string' && parsed.title.trim() ? parsed.title.trim() : '';
  const summary = typeof parsed?.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : '';
  const points = list(parsed?.points).filter((point) => !containsBeginnerJargon(point, contentLanguage));
  const assumptions = list(parsed?.assumptions).filter((assumption) => !containsBeginnerJargon(assumption, contentLanguage));
  if (!title || !summary || containsBeginnerJargon(title, contentLanguage) || containsBeginnerJargon(summary, contentLanguage) || !points.length || !assumptions.length) {
    throw new Error('ai-response-invalid');
  }
  return { title, summary, points, assumptions };
}

export async function sunlightAnalysis(seed: SeedState, sources: SunlightSource[] = [], providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<SunlightAnalysis> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const webContext = sources.map((source) => `${source.title} — ${source.source}: ${source.snippet}`).join(' | ') || 'No web sources; use model knowledge and mark uncertain claims as estimates.';
  const response = await provider.ask(sunlightPrompt(seed, webContext));
  const parsed = parseJsonObject(response);
  const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).slice(0, 6) : [];
  const areas = Array.isArray(parsed?.areas) ? parsed.areas.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => ({ name: typeof item.name === 'string' ? item.name.trim() : '', findings: list(item.findings).filter((finding) => !containsBeginnerJargon(finding, contentLanguage)), facts: list(item.facts).filter((fact) => !containsBeginnerJargon(fact, contentLanguage)), estimates: list(item.estimates).filter((estimate) => !containsBeginnerJargon(estimate, contentLanguage)) })).filter((area) => area.name && !containsBeginnerJargon(area.name, contentLanguage) && (area.findings.length || area.facts.length || area.estimates.length)).slice(0, 8) : [];
  if (areas.length < 3) throw new Error('ai-response-invalid');
  const assumptions = list(parsed?.assumptions).filter((assumption) => !containsBeginnerJargon(assumption, contentLanguage));
  const openQuestions = list(parsed?.openQuestions).map((question) => sanitizeQuestion(question)).filter((question) => question && !containsBeginnerJargon(question, contentLanguage) && !isTooComplexQuestion(question, contentLanguage));
  return { areas, assumptions, openQuestions };
}

export async function evolutionSuggestions(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<EvolutionSuggestion[]> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const response = await provider.ask(evolutionPrompt(seed));
  const parsed = parseJsonObject(response);
  const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')).map((item) => ({ name: typeof item.name === 'string' ? item.name.trim() : '', summary: typeof item.summary === 'string' ? item.summary.trim() : '' })).filter((item) => item.name && item.summary && !containsBeginnerJargon(`${item.name} ${item.summary}`, contentLanguage)).slice(0, 4) : [];
  if (suggestions.length < 2) throw new Error('ai-response-invalid');
  return suggestions;
}

export async function suggestBranches(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ name: string; summary: string }>> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const response = await provider.ask(branchPrompt(seed));
  const parsed = parseJsonObject(response) as { branches?: Array<{ name: string; summary: string }> } | undefined;
  const branches = (parsed?.branches ?? []).filter((branch) => branch?.name && branch?.summary && !containsBeginnerJargon(`${branch.name} ${branch.summary}`, contentLanguage)).slice(0, 4);
  if (branches.length < 2) throw new Error('ai-response-invalid');
  return branches;
}

export async function suggestPrune(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ item: string; reason: string }>> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const response = await provider.ask(prunePrompt(seed));
  const parsed = parseJsonObject(response) as { items?: Array<{ item: string; reason: string }> } | undefined;
  const items = (parsed?.items ?? []).filter((item) => item?.item && item?.reason && !containsBeginnerJargon(`${item.item} ${item.reason}`, contentLanguage));
  return items;
}

export async function evaluateMaturity(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en', sunlightResearch: ResearchEntry[] = []): Promise<MaturityEvaluation> {
  const contentLanguage = inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, seed.problem, ...seed.users, ...seed.goals, ...seed.assumptions]);
  const provider = await getProvider(providerId, model, contentLanguage);
  const researchContext = sunlightResearch.slice(-8).map((entry) => `${entry.title}: ${entry.summary}`).join(' | ');
  const response = await provider.ask(bloomPrompt(seed, researchContext));
  const parsed = parseJsonObject(response);
  const rawDimensions = Array.isArray(parsed?.dimensions) ? parsed.dimensions : [];
  if (!rawDimensions.length) throw new Error('ai-response-invalid');
  const dimensions = seed.maturityDimensions.map((dimension) => {
    const candidate = rawDimensions.find((item) => item && typeof item === 'object' && canonicalMaturityDimension((item as { name?: unknown }).name) === canonicalMaturityDimension(dimension.name)) as { score?: unknown; reason?: unknown } | undefined;
    const score = Number(candidate?.score);
    const reason = typeof candidate?.reason === 'string' && candidate.reason.trim() && !containsBeginnerJargon(candidate.reason, contentLanguage)
      ? candidate.reason.trim() : dimension.reason;
    return candidate && Number.isFinite(score)
      ? { ...dimension, score: Math.max(0, Math.min(100, Math.round(score))), reason }
      : dimension;
  });
  // Clear/uncertain are dimension buckets, not free-form commentary. Keep
  // only canonical names so a provider's explanatory sentence cannot leak
  // into a localized recommendation as an untranslated label.
  const listDimensions = (value: unknown): string[] => Array.isArray(value) ? value.map((item) => canonicalMaturityDimension(item)).filter((item): item is string => Boolean(item)).slice(0, 5) : [];
  const listExplore = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => canonicalMaturityDimension(item) ?? item.trim()).filter((item) => !containsBeginnerJargon(item, contentLanguage)).slice(0, 5) : [];
  const clear = listDimensions(parsed?.clear); const uncertain = listDimensions(parsed?.uncertain); const explore = listExplore(parsed?.explore);
  const open = seed.openQuestions.filter((question) => question.status === 'open').map((question) => question.question).slice(0, 3);
  return {
    dimensions,
    clear: clear.length ? clear : dimensions.filter((dimension) => dimension.score >= 60).map((dimension) => dimension.name),
    uncertain: uncertain.length ? uncertain : dimensions.filter((dimension) => dimension.score < 60).map((dimension) => dimension.name),
    explore: explore.length ? explore : open.length ? open : dimensions.filter((dimension) => dimension.score < 60).slice(0, 3).map((dimension) => dimension.name),
  };
}
