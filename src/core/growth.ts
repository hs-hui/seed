import { SeedState, now, OpenQuestion } from '../domain.js';
import { randomUUID } from 'node:crypto';
import { SeedStore } from '../storage/store.js';
import { addConversation, addEvent } from './seed-manager.js';
import { growthUpdate, nextQuestion, dimensionsFor } from '../ai/provider.js';
import type { ProviderLanguage } from '../ai/provider.js';
import { calculateMaturity, statusForMaturity } from './maturity.js';

export async function askGrowthQuestion(store: SeedStore, seed: SeedState, providerId?: string, branchId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<string> {
  const allConversations = await store.conversations(seed.id);
  const recentConversation = allConversations.filter((entry) => !branchId || !entry.branchId || entry.branchId === branchId);
  const currentBranch = branchId ? (await store.branches(seed.id)).find((branch) => branch.id === branchId) : undefined;
  const suggestion = await nextQuestion(seed, providerId, model, language, recentConversation, currentBranch);
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'question', content: suggestion.question,
    ...(suggestion.focus ? { metadata: { focus: suggestion.focus } } : {}) });
  const existing = seed.openQuestions.find((question) => question.status === 'open' && question.question === suggestion.question && question.branchId === branchId);
  if (!existing) {
    const question: OpenQuestion = { id: randomUUID(), seedId: seed.id, ...(branchId ? { branchId } : {}), question: suggestion.question, ...(suggestion.focus ? { focus: suggestion.focus } : {}),
      importance: 'medium', status: 'open', createdAt: now() };
    await store.save({ ...seed, openQuestions: [...seed.openQuestions, question], updatedAt: now() });
  }
  return suggestion.question;
}
export async function applyGrowth(store: SeedStore, seed: SeedState, answer: string, providerId?: string, branchId?: string, language: ProviderLanguage = 'en', model?: string): Promise<{ before: string; after: string; seed: SeedState; update: Awaited<ReturnType<typeof growthUpdate>> }> {
  const before = seed.coreIdea;
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'user', type: 'answer', content: answer });
  const trimmed = answer.trim();
  const allConversations = await store.conversations(seed.id);
  const conversations = allConversations.filter((entry) => !branchId || !entry.branchId || entry.branchId === branchId);
  const asked = [...conversations].reverse().find((entry) => entry.role === 'assistant' && entry.type === 'question' && entry.branchId === branchId);
  const askedQuestion = seed.openQuestions.find((question) => question.question === asked?.content && question.status === 'open' && question.branchId === branchId);
  const currentBranch = branchId ? (await store.branches(seed.id)).find((branch) => branch.id === branchId) : undefined;
  const update = await growthUpdate(seed, trimmed, providerId, model, language, conversations, currentBranch);
  const openQuestions = seed.openQuestions.map((question) => question.question === asked?.content && question.status === 'open' && question.branchId === branchId
    ? { ...question, status: 'answered' as const, answer: trimmed, answeredAt: now() } : question);
  const askedText = asked?.content.toLowerCase() ?? '';
  const focus = askedQuestion?.focus;
  // "사용자" appears in many outcome questions, so only classify a
  // response as a user definition when the question asks who/which person.
  const asksUser = focus === 'user' || askedText.includes('who') || /누구|누가|대상/.test(askedText);
  const asksProblem = focus === 'problem' || askedText.includes('problem') || /문제|어려|고통|힘든|답답|불편/.test(askedText);
  const asksConstraint = focus === 'constraint' || askedText.includes('constraint') || /제약|범위|제한|줄여|남기|첫 버전|처음/.test(askedText);
  const asksAssumption = focus === 'assumption' || askedText.includes('assumption') || /가정|전제|검증|확인해야/.test(askedText);
  const asksGoal = focus === 'goal' || (!focus && !asksUser && !asksProblem && !asksConstraint && !asksAssumption);
  const resolvedFocus = focus ?? (asksUser ? 'user' : asksProblem ? 'problem' : asksGoal ? 'goal' : asksConstraint ? 'constraint' : asksAssumption ? 'assumption' : 'validation');
  const users = asksUser && !seed.users.includes(trimmed) ? [...seed.users, trimmed.slice(0, 120)] : seed.users;
  const problem = asksProblem && !seed.problem ? trimmed : seed.problem;
  const constraints = asksConstraint && !seed.constraints.includes(trimmed) ? [...seed.constraints, trimmed.slice(0, 160)] : seed.constraints;
  const assumptions = asksAssumption && !seed.assumptions.includes(trimmed) ? [...seed.assumptions, trimmed.slice(0, 160)] : seed.assumptions;
  const goals = asksGoal && !seed.goals.includes(trimmed)
    ? [...seed.goals, trimmed.slice(0, 160)] : seed.goals;
  const updated: SeedState = { ...seed, coreIdea: update.updatedSummary, problem, users, goals, constraints, assumptions, openQuestions,
    maturity: seed.maturity,
    status: seed.status === 'seedling' ? 'growing' : seed.status, updatedAt: now() };
  updated.maturityDimensions = dimensionsFor(updated, resolvedFocus, update.maturityDelta);
  updated.maturity = calculateMaturity(updated); updated.status = statusForMaturity(updated.maturity);
  await store.save(updated); await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'summary', content: update.updatedSummary,
    metadata: { maturityDelta: update.maturityDelta, questionReason: update.questionReason } });
  for (const contradiction of update.contradictionsDetected) {
    await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'insight', content: contradiction });
  }
  if (branchId) {
    const branch = (await store.branches(seed.id)).find((candidate) => candidate.id === branchId);
    if (branch) await store.saveBranch({ ...branch, summary: update.updatedSummary, maturity: updated.maturity, updatedAt: now() });
  }
  await addEvent(store, updated, 'grow', `Core idea updated: ${update.updatedSummary}`, { branchId, maturityDelta: update.maturityDelta,
    ...(update.contradictionsDetected.length ? { contradictions: update.contradictionsDetected } : {}),
    ...(update.suggestions.length ? { suggestions: update.suggestions } : {}) });
  return { before, after: update.updatedSummary, seed: updated, update };
}

/** Growth is ready to pause once the essential story has been answered. */
export function growthReady(seed: SeedState): boolean {
  const answered = seed.openQuestions.filter((question) => question.status === 'answered').length;
  return answered >= 4 && Boolean(seed.problem) && seed.users.length > 0 && seed.goals.length > 0
    && (seed.constraints.length > 0 || seed.assumptions.length > 0) && seed.maturity >= 58;
}
