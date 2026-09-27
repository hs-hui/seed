import { createSeed, Decision, SeedState, now, ConversationEntry, GrowthEvent } from '../domain.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ensureLine, withKeyedLock } from '../utils/fs.js';
import { SeedStore } from '../storage/store.js';
import { calculateMaturity, statusForMaturity } from './maturity.js';

async function plantUnlocked(store: SeedStore, idea: string, name?: string, parentSeedId?: string): Promise<SeedState> {
  const normalizedIdea = idea.trim();
  if (!normalizedIdea) throw new Error('idea-required');
  if (await store.hasSeed()) throw new Error('seed-exists');
  const seed = createSeed(normalizedIdea, name, parentSeedId); await store.create(seed);
  const gitignore = path.join(store.root, '.gitignore');
  await ensureLine(gitignore, '# Seed - idea growth tool');
  await ensureLine(gitignore, '.seed/');
  await addEvent(store, seed, 'plant', `Planted: ${normalizedIdea}`);
  return seed;
}
export async function plant(store: SeedStore, idea: string, name?: string, parentSeedId?: string): Promise<SeedState> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => plantUnlocked(store, idea, name, parentSeedId));
}
export async function addConversation(store: SeedStore, entry: Omit<ConversationEntry, 'id' | 'createdAt'>): Promise<ConversationEntry> {
  const value: ConversationEntry = { ...entry, id: randomUUID(), createdAt: now() };
  await store.appendConversation(value); return value;
}
export async function addEvent(store: SeedStore, seed: SeedState, type: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
  const event: GrowthEvent = { id: randomUUID(), seedId: seed.id, type, message, createdAt: now(), ...(metadata ? { metadata } : {}) };
  await store.appendEvent(event);
}

/** Persist an explicit user-confirmed decision; AI suggestions never call this. */
async function recordDecisionUnlocked(store: SeedStore, seed: SeedState, decisionText: string, reason = 'Confirmed by the user', branchId?: string): Promise<{ seed: SeedState; decision: Decision }> {
  const decision = decisionText.trim();
  if (!decision) throw new Error('decision-required');
  const current = await store.load();
  if (current.status === 'dormant') throw new Error('seed-dormant');
  const requestedBranchId = branchId?.trim().toLocaleLowerCase();
  const branch = requestedBranchId ? (await store.branches(current.id)).find((candidate) => candidate.id.toLocaleLowerCase() === requestedBranchId) : undefined;
  if (requestedBranchId && !branch) throw new Error('branch-selection-not-found');
  if (branch) branchId = branch.id;
  if (branch && branch.status !== 'active') throw new Error('branch-not-active');
  const value: Decision = { id: randomUUID(), seedId: current.id, ...(branchId ? { branchId } : {}), decision, reason: reason.trim() || 'Confirmed by the user', source: 'user', confirmedByUser: true, createdAt: now() };
  // Branch decisions belong to that exploration path. Do not append them to
  // the parent decision list or recalculate the parent's maturity: selecting
  // a branch must never mutate the core Seed's evidence.
  if (branch) {
    const updatedBranch = { ...branch, decisions: [...branch.decisions, value], maturity: Math.min(100, branch.maturity + 2), updatedAt: now() };
    await store.saveBranch(updatedBranch); await store.saveDecision(value);
    await addEvent(store, current, 'decision', `Decision confirmed: ${decision}`, { decisionId: value.id, branchId });
    return { seed: current, decision: value };
  }
  const updated: SeedState = { ...current, decisions: [...current.decisions, value], updatedAt: now() };
  updated.maturity = Math.max(current.maturity, calculateMaturity(updated));
  if (updated.status !== 'dormant' && updated.status !== 'harvested') updated.status = statusForMaturity(updated.maturity);
  await store.save(updated); await store.saveDecision(value);
  await addEvent(store, updated, 'decision', `Decision confirmed: ${decision}`, { decisionId: value.id });
  return { seed: updated, decision: value };
}

export async function recordDecision(store: SeedStore, seed: SeedState, decisionText: string, reason = 'Confirmed by the user', branchId?: string): Promise<{ seed: SeedState; decision: Decision }> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => recordDecisionUnlocked(store, seed, decisionText, reason, branchId));
}
