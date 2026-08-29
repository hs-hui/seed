import { Branch, SeedState, now, slugify } from '../domain.js';
import { randomUUID } from 'node:crypto';
import { SeedStore } from '../storage/store.js';
import { addEvent } from './seed-manager.js';
import { suggestBranches, suggestPrune } from '../ai/provider.js';

export async function createBranch(store: SeedStore, seed: SeedState, name: string, summary: string, providerId?: string): Promise<Branch> {
  const active = (await store.branches(seed.id)).filter((b) => b.status === 'active');
  if (active.length >= 5) throw new Error('too-many-branches');
  const branch: Branch = { id: randomUUID(), seedId: seed.id, name, slug: `${slugify(name)}-${Date.now()}`,
    summary, direction: name, status: 'active', maturity: seed.maturity, assumptions: [], decisions: [], openQuestions: [], createdAt: now(), updatedAt: now() };
  await store.saveBranch(branch); const updated = { ...seed, branches: [...seed.branches, branch.id], activeBranch: branch.id, status: 'branching' as const, updatedAt: now() };
  await store.save(updated); await addEvent(store, updated, 'branch', `Branch created: ${name}`, { branchId: branch.id }); return branch;
}
export async function branchSuggestions(seed: SeedState, providerId?: string, model?: string): Promise<Array<{ name: string; summary: string }>> { return suggestBranches(seed, providerId, model); }
export async function pruneSuggestions(seed: SeedState, providerId?: string, model?: string): Promise<Array<{ item: string; reason: string }>> { return suggestPrune(seed, providerId, model); }
export async function pruneItem(store: SeedStore, seed: SeedState, item: string): Promise<SeedState> {
  const branches = await store.branches(seed.id); const target = branches.find((b) => b.name.toLowerCase() === item.toLowerCase() || b.id === item);
  if (target) { await store.saveBranch({ ...target, status: 'pruned', updatedAt: now() }); }
  const updated: SeedState = { ...seed, prunedItems: seed.prunedItems.includes(item) ? seed.prunedItems : [...seed.prunedItems, item],
    activeBranch: target && seed.activeBranch === target.id ? branches.find((branch) => branch.id !== target.id && branch.status === 'active')?.id : seed.activeBranch,
    constraints: seed.constraints.includes(`Pruned from MVP: ${item}`) ? seed.constraints : [...seed.constraints, `Pruned from MVP: ${item}`], status: 'pruning', updatedAt: now() };
  updated.maturity = Math.min(100, updated.maturity + 2); await store.save(updated); await addEvent(store, updated, 'prune', `Pruned: ${item}`); return updated;
}
