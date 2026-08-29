import { SeedState, now, OpenQuestion } from '../domain.js';
import { randomUUID } from 'node:crypto';
import { SeedStore } from '../storage/store.js';
import { addConversation, addEvent } from './seed-manager.js';
import { nextQuestion, dimensionsFor } from '../ai/provider.js';
import { calculateMaturity, statusForMaturity } from './maturity.js';

export async function askGrowthQuestion(store: SeedStore, seed: SeedState, providerId?: string, branchId?: string, model?: string): Promise<string> {
  const suggestion = await nextQuestion(seed, providerId, model);
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'assistant', type: 'question', content: suggestion.question });
  return suggestion.question;
}
export async function applyGrowth(store: SeedStore, seed: SeedState, answer: string, providerId?: string, branchId?: string): Promise<{ before: string; after: string; seed: SeedState }> {
  const before = seed.coreIdea;
  await addConversation(store, { seedId: seed.id, ...(branchId ? { branchId } : {}), role: 'user', type: 'answer', content: answer });
  const trimmed = answer.trim();
  const after = trimmed.length > 160 ? `${before} — ${trimmed.slice(0, 157)}...` : `${before} — ${trimmed}`;
  const question: OpenQuestion = {
    id: randomUUID(), seedId: seed.id, ...(branchId ? { branchId } : {}),
    question: 'What is the next concrete outcome a user should get?', importance: 'medium', status: 'open', createdAt: now(),
  };
  const updated: SeedState = { ...seed, coreIdea: after, problem: seed.problem || trimmed, goals: seed.goals.length ? seed.goals : [trimmed],
    openQuestions: [...seed.openQuestions.filter((q) => q.question !== question.question), question], maturity: Math.min(100, seed.maturity + 5),
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
