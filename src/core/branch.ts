import { Branch, SeedState, now, slugify } from '../domain.js';
import { randomUUID } from 'node:crypto';
import { SeedStore } from '../storage/store.js';
import { addEvent } from './seed-manager.js';
import { coreAI } from './ai.js';
import type { ProviderLanguage } from '../ai/contracts.js';
import path from 'node:path';
import { withKeyedLock } from '../utils/fs.js';

async function createBranchUnlocked(store: SeedStore, seed: SeedState, name: string, summary: string, providerId?: string): Promise<Branch> {
  const currentSeed = await store.load();
  if (currentSeed.status === 'dormant') throw new Error('seed-dormant');
  if (!name.trim()) throw new Error('branch-name-required');
  if (!summary.trim()) throw new Error('branch-summary-required');
  const active = (await store.branches(currentSeed.id)).filter((b) => b.status === 'active');
  if (active.length >= 5) throw new Error('too-many-branches');
  const branch: Branch = { id: randomUUID(), seedId: currentSeed.id, name, slug: `${slugify(name)}-${Date.now()}`,
    summary, direction: name, status: 'active', maturity: currentSeed.maturity, assumptions: [], decisions: [], openQuestions: [], createdAt: now(), updatedAt: now() };
  await store.saveBranch(branch); const updated = { ...currentSeed, branches: [...currentSeed.branches, branch.id], activeBranch: branch.id, status: 'branching' as const, updatedAt: now() };
  await store.save(updated); await addEvent(store, updated, 'branch', `Branch created: ${name}`, { branchId: branch.id }); return branch;
}
export async function createBranch(store: SeedStore, seed: SeedState, name: string, summary: string, providerId?: string): Promise<Branch> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => createBranchUnlocked(store, seed, name, summary, providerId));
}
export async function branchSuggestions(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ name: string; summary: string }>> { return coreAI.suggestBranches(seed, providerId, model, language); }
export async function pruneSuggestions(seed: SeedState, providerId?: string, model?: string, language: ProviderLanguage = 'en'): Promise<Array<{ item: string; reason: string }>> { return coreAI.suggestPrune(seed, providerId, model, language); }
async function pruneItemUnlocked(store: SeedStore, seed: SeedState, item: string, language: 'en' | 'ko' = 'en'): Promise<SeedState> {
  const currentSeed = await store.load();
  if (currentSeed.status === 'dormant') throw new Error('seed-dormant');
  const requestedItem = item.trim();
  if (!requestedItem) throw new Error('prune-item-required');
  const branches = await store.branches(currentSeed.id); const normalizedItem = requestedItem.toLocaleLowerCase(); const target = branches.find((b) => b.name.toLocaleLowerCase() === normalizedItem || b.id.toLocaleLowerCase() === normalizedItem);
  if (target) { await store.saveBranch({ ...target, status: 'pruned', updatedAt: now() }); }
  const before = currentSeed.coreIdea;
  const label = target?.name ?? requestedItem;
  const scopeNote = language === 'ko' ? `첫 버전에서는 ${label}은 나중에 해도 괜찮아요.` : `For the first version, we can leave ${label} for later.`;
  const after = before.toLocaleLowerCase().includes(scopeNote.toLocaleLowerCase()) ? before : `${before} — ${scopeNote}`.slice(0, 240);
  const alreadyPruned = currentSeed.prunedItems.some((entry) => {
    const normalizedEntry = entry.trim().toLocaleLowerCase();
    return normalizedEntry === normalizedItem || Boolean(target && (normalizedEntry === target.id.toLocaleLowerCase() || normalizedEntry === target.name.trim().toLocaleLowerCase()));
  });
  const constraint = language === 'ko' ? `첫 버전에서 나중으로 미룸: ${requestedItem}` : `Deferred from first version: ${requestedItem}`;
  const hasConstraint = currentSeed.constraints.some((entry) => entry.trim().toLocaleLowerCase() === constraint.toLocaleLowerCase());
  const firstPrune = !alreadyPruned;
  const updated: SeedState = { ...currentSeed, prunedItems: alreadyPruned ? currentSeed.prunedItems : [...currentSeed.prunedItems, requestedItem],
    activeBranch: target && currentSeed.activeBranch === target.id
      ? branches.find((branch) => branch.id !== target.id && branch.status === 'active')?.id
      : currentSeed.activeBranch,
    coreIdea: after,
    constraints: hasConstraint ? currentSeed.constraints : [...currentSeed.constraints, constraint], status: 'pruning', updatedAt: now() };
  updated.maturity = Math.min(100, updated.maturity + (firstPrune ? 2 : 0)); await store.save(updated); await addEvent(store, updated, 'prune', `Pruned: ${requestedItem}`, { before, after, item: requestedItem, repeated: !firstPrune }); return updated;
}
export async function pruneItem(store: SeedStore, seed: SeedState, item: string, language: 'en' | 'ko' = 'en'): Promise<SeedState> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => pruneItemUnlocked(store, seed, item, language));
}
