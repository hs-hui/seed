import { SeedState, now, OpenQuestion } from '../domain.js';
import { randomUUID } from 'node:crypto';
import { SeedStore } from '../storage/store.js';
import { addConversation, addEvent } from './seed-manager.js';
import { coreAI } from './ai.js';
import type { GrowthUpdate, ProviderLanguage } from '../ai/contracts.js';
import type { ContextExtras } from '../ai/context-builder.js';
import { calculateMaturity, statusForMaturity } from './maturity.js';
import { detectGrowthInputIntent } from '../ai/input-intent.js';
import path from 'node:path';
import { withKeyedLock } from '../utils/fs.js';
function requiredFocus(seed: SeedState): 'user' | 'problem' | 'goal' | 'constraint' | 'assumption' | 'validation' {
  if (!seed.users.length) return 'user';
  if (!seed.problem) return 'problem';
  if (!seed.goals.length) return 'goal';
  if (!seed.constraints.length) return 'constraint';
  if (!seed.assumptions.length) return 'assumption';
  return 'validation';
}

/**
 * Short meta replies are part of a conversation, not idea evidence. Keep this
 * conservative: a sentence such as "the problem is too hard" can still be a
 * valid answer, while an explicit request to rephrase or skip the question
 * should never be appended to the idea summary.
 */
export function isQuestionChangeRequest(value: string): boolean {
  return detectGrowthInputIntent(value) === 'change-question';
}
/** Keep an unanswered question open when the user asks to think and return later. */
export function isGrowthPauseRequest(value: string): boolean {
  return detectGrowthInputIntent(value) === 'pause';
}

/** Cancel the pending question and continue with a fresh one in the same focus. */
async function changeGrowthQuestionUnlocked(
  store: SeedStore,
  seed: SeedState,
  providerId?: string,
  branchId?: string,
  model?: string,
  language: ProviderLanguage = 'en',
  request = '',
): Promise<string> {
  seed = await store.load();
  const requestedBranchId = branchId?.trim().toLocaleLowerCase();
  const currentBranch = requestedBranchId ? (await store.branches(seed.id)).find((branch) => branch.id.toLocaleLowerCase() === requestedBranchId) : undefined;
  if (requestedBranchId && !currentBranch) throw new Error('branch-selection-not-found');
  if (currentBranch) branchId = currentBranch.id;
  if (currentBranch && currentBranch.status !== 'active') throw new Error('branch-not-active');
  const pending = seed.openQuestions.find((question) => question.status === 'open' && question.branchId === branchId)
    ?? currentBranch?.openQuestions.find((question) => question.status === 'open');
  if (pending) {
    const cancelledAt = now();
    const openQuestions = seed.openQuestions.map((question) => question.id === pending.id
      ? { ...question, status: 'cancelled' as const, cancelledAt } : question);
    await store.save({ ...seed, openQuestions, updatedAt: cancelledAt });
    if (currentBranch) {
      await store.saveBranch({
        ...currentBranch,
        openQuestions: currentBranch.openQuestions.map((question) => question.id === pending.id
          ? { ...question, status: 'cancelled' as const, cancelledAt } : question),
        updatedAt: cancelledAt,
      });
    }
    await addConversation(store, {
      seedId: seed.id,
      ...(branchId ? { branchId } : {}),
      role: 'user',
      type: 'answer',
      content: request.trim() || 'change-question',
      metadata: { intent: 'change-question', skippedQuestion: pending.question },
    });
  }
  return askGrowthQuestionUnlocked(store, await store.load(), providerId, branchId, model, language, true);
}

export async function changeGrowthQuestion(
  store: SeedStore,
  seed: SeedState,
  providerId?: string,
  branchId?: string,
  model?: string,
  language: ProviderLanguage = 'en',
  request = '',
): Promise<string> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => changeGrowthQuestionUnlocked(store, seed, providerId, branchId, model, language, request));
}

async function askGrowthQuestionUnlocked(store: SeedStore, seed: SeedState, providerId?: string, branchId?: string, model?: string, language: ProviderLanguage = 'en', preferSimpleQuestion = false): Promise<string> {
  // Treat the persisted file as the source of truth. Callers often retain a
  // state snapshot from the previous turn while another command has already
  // appended a question or answer.
  seed = await store.load();
  const [allConversations, relevantHistory, sunlightResearch] = await Promise.all([
    store.conversations(seed.id),
    store.events(seed.id),
    store.research(seed.id),
  ]);
  const contextExtras: ContextExtras = { relevantHistory, sunlightResearch, ...(preferSimpleQuestion ? { preferSimpleQuestion: true } : {}) };
  const recentConversation = allConversations.filter((entry) => branchId
    ? (!entry.branchId || entry.branchId === branchId)
    : !entry.branchId);
  const requestedBranchId = branchId?.trim().toLocaleLowerCase();
  const currentBranch = requestedBranchId ? (await store.branches(seed.id)).find((branch) => branch.id.toLocaleLowerCase() === requestedBranchId) : undefined;
  if (requestedBranchId && !currentBranch) throw new Error('branch-selection-not-found');
  if (currentBranch) branchId = currentBranch.id;
  if (currentBranch && currentBranch.status !== 'active') throw new Error('branch-not-active');
  // Resuming a paused session should continue its unanswered question. This
  // keeps the conversation coherent and prevents duplicate open questions
  // from inflating the maturity context.
  const pending = seed.openQuestions.find((question) => question.status === 'open' && question.branchId === branchId)
    ?? currentBranch?.openQuestions.find((question) => question.status === 'open');
  if (pending) {
    // A pending question can predate the current beginner-language guards.
    // Replace it on resume instead of showing stale jargon or an abstract
    // prompt that the user already found difficult.
    const pendingLanguage = coreAI.inferProviderLanguage(language, [seed.originalIdea, seed.coreIdea, pending.question]);
    if (!coreAI.isBeginnerFriendlyQuestion(pending.question, pendingLanguage)) {
      const cancelledAt = now();
      const openQuestions = seed.openQuestions.map((question) => question.id === pending.id
        ? { ...question, status: 'cancelled' as const, cancelledAt } : question);
      await store.save({ ...seed, openQuestions, updatedAt: cancelledAt });
      if (currentBranch) {
        await store.saveBranch({
          ...currentBranch,
          openQuestions: currentBranch.openQuestions.map((question) => question.id === pending.id
            ? { ...question, status: 'cancelled' as const, cancelledAt } : question),
          updatedAt: cancelledAt,
        });
      }
      return askGrowthQuestionUnlocked(store, await store.load(), providerId, branchId, model, language, true);
    }
    if (!allConversations.some((entry) => entry.role === 'assistant' && entry.type === 'question' && entry.branchId === branchId && entry.content === pending.question)) {
      await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'question', content: pending.question,
        ...(pending.focus ? { metadata: { focus: pending.focus } } : {}) });
    }
    return pending.question;
  }
  const suggestion = await coreAI.nextQuestion(seed, providerId, model, language, recentConversation, currentBranch, contextExtras);
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'question', content: suggestion.question,
    ...(suggestion.focus ? { metadata: { focus: suggestion.focus } } : {}) });
  const existing = seed.openQuestions.find((question) => question.status === 'open' && question.question === suggestion.question && question.branchId === branchId);
  if (!existing) {
    const question: OpenQuestion = { id: randomUUID(), seedId: seed.id, ...(branchId ? { branchId } : {}), question: suggestion.question, ...(suggestion.focus ? { focus: suggestion.focus } : {}),
      importance: suggestion.focus === 'user' || suggestion.focus === 'problem' || suggestion.focus === 'goal' ? 'high' : 'medium', status: 'open', createdAt: now() };
    await store.save({ ...seed, openQuestions: [...seed.openQuestions, question], updatedAt: now() });
    if (currentBranch) await store.saveBranch({ ...currentBranch, openQuestions: [...currentBranch.openQuestions, question], updatedAt: now() });
  }
  return suggestion.question;
}
export async function askGrowthQuestion(store: SeedStore, seed: SeedState, providerId?: string, branchId?: string, model?: string, language: ProviderLanguage = 'en', preferSimpleQuestion = false): Promise<string> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => askGrowthQuestionUnlocked(store, seed, providerId, branchId, model, language, preferSimpleQuestion));
}

async function applyGrowthUnlocked(store: SeedStore, seed: SeedState, answer: string, providerId?: string, branchId?: string, language: ProviderLanguage = 'en', model?: string): Promise<{ before: string; after: string; seed: SeedState; update: GrowthUpdate }> {
  seed = await store.load();
  if (seed.status === 'dormant') throw new Error('seed-dormant');
  if (!answer.trim()) throw new Error('answer-required');
  const requestedBranchId = branchId?.trim().toLocaleLowerCase();
  const currentBranch = requestedBranchId ? (await store.branches(seed.id)).find((branch) => branch.id.toLocaleLowerCase() === requestedBranchId) : undefined;
  if (requestedBranchId && !currentBranch) throw new Error('branch-selection-not-found');
  if (currentBranch) branchId = currentBranch.id;
  if (currentBranch && currentBranch.status !== 'active') throw new Error('branch-not-active');
  // A branch is an independent exploration path. Keep its summary and
  // maturity on the branch record instead of silently rewriting the parent
  // seed's core idea and fields.
  const workingSeed = currentBranch ? { ...seed, coreIdea: currentBranch.summary } : seed;
  const before = workingSeed.coreIdea;
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'user', type: 'answer', content: answer });
  const trimmed = answer.trim();
  const [allConversations, relevantHistory, sunlightResearch] = await Promise.all([
    store.conversations(seed.id),
    store.events(seed.id),
    store.research(seed.id),
  ]);
  const conversations = allConversations.filter((entry) => branchId
    ? (!entry.branchId || entry.branchId === branchId)
    : !entry.branchId);
  const asked = [...conversations].reverse().find((entry) => entry.role === 'assistant' && entry.type === 'question' && entry.branchId === branchId);
  const askedQuestion = seed.openQuestions.find((question) => question.question === asked?.content && question.status === 'open' && question.branchId === branchId);
  const update = await coreAI.growthUpdate(workingSeed, trimmed, providerId, model, language, conversations, currentBranch, { relevantHistory, sunlightResearch });
  const openQuestions = seed.openQuestions.map((question) => question.question === asked?.content && question.status === 'open' && question.branchId === branchId
    ? { ...question, status: 'answered' as const, answer: trimmed, answeredAt: now() } : question);
  const askedText = asked?.content.toLowerCase() ?? '';
  // Older state files may contain an open question without the optional
  // focus metadata. Fall back to the next required field so its answer is
  // still filed in the right part of the seed instead of becoming a goal by
  // accident.
  const focus = askedQuestion?.focus ?? requiredFocus(seed);
  // "사용자" appears in many outcome questions, so only classify a
  // response as a user definition when the question asks who/which person.
  const asksUser = focus === 'user' || askedText.includes('who') || /누구|누가|대상/.test(askedText);
  const asksProblem = focus === 'problem' || askedText.includes('problem') || /문제|어려|고통|힘든|답답|불편/.test(askedText);
  const asksConstraint = focus === 'constraint' || askedText.includes('constraint') || /제약|범위|제한|줄여|남기|첫 버전|처음/.test(askedText);
  const asksAssumption = focus === 'assumption' || askedText.includes('assumption') || /가정|전제|검증|확인해야/.test(askedText);
  const asksGoal = focus === 'goal' || (!focus && !asksUser && !asksProblem && !asksConstraint && !asksAssumption);
  const resolvedFocus = focus ?? (asksUser ? 'user' : asksProblem ? 'problem' : asksGoal ? 'goal' : asksConstraint ? 'constraint' : asksAssumption ? 'assumption' : 'validation');
  const users = !currentBranch && asksUser && !seed.users.includes(trimmed) ? [...seed.users, trimmed.slice(0, 120)] : seed.users;
  const problem = !currentBranch && asksProblem && !seed.problem ? trimmed : seed.problem;
  const constraints = !currentBranch && asksConstraint && !seed.constraints.includes(trimmed) ? [...seed.constraints, trimmed.slice(0, 160)] : seed.constraints;
  const assumptions = !currentBranch && asksAssumption && !seed.assumptions.includes(trimmed) ? [...seed.assumptions, trimmed.slice(0, 160)] : seed.assumptions;
  const goals = !currentBranch && asksGoal && !seed.goals.includes(trimmed)
    ? [...seed.goals, trimmed.slice(0, 160)] : seed.goals;
  const updated: SeedState = currentBranch
    ? { ...seed, openQuestions, updatedAt: now() }
    : { ...seed, coreIdea: update.updatedSummary, problem, users, goals, constraints, assumptions, openQuestions,
      maturity: seed.maturity, status: seed.status === 'seedling' ? 'growing' : seed.status, updatedAt: now() };
  if (!currentBranch) {
    updated.maturityDimensions = coreAI.dimensionsFor(updated, resolvedFocus, update.maturityDelta, language);
    // A completed, non-empty turn is evidence of progress. The dimension
    // average remains the source of truth, but rounding/another dimension's
    // low score must not make a useful answer look like it made no progress.
    // Bloom can still lower the score later when it performs a full review.
    updated.maturity = Math.min(100, Math.max(seed.maturity + 1, calculateMaturity(updated)));
    updated.status = statusForMaturity(updated.maturity);
  }
  await store.save(updated); await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'summary', content: update.updatedSummary,
    metadata: { maturityDelta: update.maturityDelta, questionReason: update.questionReason } });
  for (const contradiction of update.contradictionsDetected) {
    await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'insight', content: contradiction });
  }
  if (branchId) {
    const branch = currentBranch;
    if (branch) {
      const branchQuestions = branch.openQuestions.map((question) => question.question === asked?.content && question.status === 'open'
        ? { ...question, status: 'answered' as const, answer: trimmed, answeredAt: now() } : question);
      const branchAssumptions = asksAssumption && !branch.assumptions.includes(trimmed) ? [...branch.assumptions, trimmed.slice(0, 160)] : branch.assumptions;
      await store.saveBranch({ ...branch, summary: update.updatedSummary, maturity: Math.min(100, branch.maturity + update.maturityDelta), assumptions: branchAssumptions, openQuestions: branchQuestions, updatedAt: now() });
    }
  }
  await addEvent(store, updated, 'grow', `Core idea updated: ${update.updatedSummary}`, { branchId, maturityDelta: update.maturityDelta,
    before,
    after: update.updatedSummary,
    ...(asked?.content ? { question: asked.content } : {}), answer: trimmed,
    ...(update.contradictionsDetected.length ? { contradictions: update.contradictionsDetected } : {}),
    ...(update.suggestions.length ? { suggestions: update.suggestions } : {}) });
  return { before, after: update.updatedSummary, seed: updated, update };
}

export async function applyGrowth(store: SeedStore, seed: SeedState, answer: string, providerId?: string, branchId?: string, language: ProviderLanguage = 'en', model?: string): Promise<{ before: string; after: string; seed: SeedState; update: GrowthUpdate }> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => applyGrowthUnlocked(store, seed, answer, providerId, branchId, language, model));
}

/** Growth is ready to pause once the essential story has been answered. */
export function growthReady(seed: SeedState): boolean {
  const answered = seed.openQuestions.filter((question) => !question.branchId && question.status === 'answered').length;
  // A usable idea needs more than a user/problem/goal sentence. Keep the
  // first conversation open through scope *and* the first explicit
  // assumption so Bloom has something it can evaluate.
  return answered >= 5 && Boolean(seed.problem) && seed.users.length > 0 && seed.goals.length > 0
    && seed.constraints.length > 0 && seed.assumptions.length > 0 && seed.maturity >= 58;
}
