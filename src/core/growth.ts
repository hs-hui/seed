import { SeedState, now, OpenQuestion } from '../domain.js';
import { randomUUID } from 'node:crypto';
import { SeedStore } from '../storage/store.js';
import { addConversation, addEvent } from './seed-manager.js';
import { nextQuestion, dimensionsFor } from '../ai/provider.js';
import type { ProviderLanguage } from '../ai/provider.js';
import { calculateMaturity, statusForMaturity } from './maturity.js';

export async function askGrowthQuestion(store: SeedStore, seed: SeedState, providerId?: string, branchId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<string> {
  const suggestion = await nextQuestion(seed, providerId, model, language);
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'question', content: suggestion.question });
  const existing = seed.openQuestions.find((question) => question.status === 'open' && question.question === suggestion.question && question.branchId === branchId);
  if (!existing) {
    const question: OpenQuestion = { id: randomUUID(), seedId: seed.id, ...(branchId ? { branchId } : {}), question: suggestion.question,
      importance: 'medium', status: 'open', createdAt: now() };
    await store.save({ ...seed, openQuestions: [...seed.openQuestions, question], updatedAt: now() });
  }
  return suggestion.question;
}
export async function applyGrowth(store: SeedStore, seed: SeedState, answer: string, providerId?: string, branchId?: string): Promise<{ before: string; after: string; seed: SeedState }> {
  const before = seed.coreIdea;
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'user', type: 'answer', content: answer });
  const trimmed = answer.trim();
  const after = `${before} — ${trimmed}`.slice(0, 240);
  const conversations = await store.conversations(seed.id);
  const asked = [...conversations].reverse().find((entry) => entry.role === 'assistant' && entry.type === 'question' && entry.branchId === branchId);
  const openQuestions = seed.openQuestions.map((question) => question.question === asked?.content && question.status === 'open'
    ? { ...question, status: 'answered' as const, answer: trimmed, answeredAt: now() } : question);
  const askedText = asked?.content.toLowerCase() ?? '';
  const asksUser = askedText.includes('who') || /누구|사람|사용자/.test(askedText);
  const asksProblem = askedText.includes('problem') || /문제|어려|고통|힘든/.test(askedText);
  const users = asksUser && !seed.users.includes(trimmed) ? [...seed.users, trimmed.slice(0, 120)] : seed.users;
  const problem = asksProblem && !seed.problem ? trimmed : seed.problem;
  const goals = !asksUser && !asksProblem && !seed.goals.includes(trimmed)
    ? [...seed.goals, trimmed.slice(0, 160)] : seed.goals;
  const maturityDelta = Math.max(1, Math.min(8, Math.ceil(trimmed.length / 50)));
  const updated: SeedState = { ...seed, coreIdea: after, problem, users, goals,
    openQuestions, maturity: Math.min(100, seed.maturity + maturityDelta),
    status: seed.status === 'seedling' ? 'growing' : seed.status, updatedAt: now() };
  updated.maturityDimensions = dimensionsFor(updated);
  updated.maturity = calculateMaturity(updated); updated.status = statusForMaturity(updated.maturity);
  await store.save(updated); await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'summary', content: after });
  if (branchId) {
    const branch = (await store.branches(seed.id)).find((candidate) => candidate.id === branchId);
    if (branch) await store.saveBranch({ ...branch, summary: after, maturity: updated.maturity, updatedAt: now() });
  }
  await addEvent(store, updated, 'grow', `Core idea updated: ${after}`, { branchId });
  return { before, after, seed: updated };
}
