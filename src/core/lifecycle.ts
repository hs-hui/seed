import { SeedState, now } from '../domain.js';
import { SeedStore } from '../storage/store.js';
import { addEvent } from './seed-manager.js';
import { statusForMaturity } from './maturity.js';
import path from 'node:path';
import { withKeyedLock } from '../utils/fs.js';

function statusAfterRestore(seed: SeedState): SeedState['status'] {
  // Restoring a pruned item must not silently roll a previously harvested
  // seed back into a growth phase. Dormant state is likewise preserved until
  // the explicit wake command.
  if (seed.status === 'dormant' || seed.status === 'harvested') return seed.status;
  return statusForMaturity(seed.maturity);
}

function removePruneNotes(coreIdea: string, labels: string[]): string {
  let cleaned = coreIdea;
  for (const label of labels.filter(Boolean)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // pruneItem records both language variants as a readable scope note. On
    // restore, remove only the matching note and keep the rest of the idea
    // (including notes for other pruned items) intact.
    for (const pattern of [
      `\\s+—\\s+For the first version, we can leave ${escaped} for later\\.`,
      `\\s+—\\s+첫 버전에서는 ${escaped}은 나중에 해도 괜찮아요\\.`,
    ]) cleaned = cleaned.replace(new RegExp(pattern, 'gi'), '');
  }
  return cleaned.trim();
}

async function witherUnlocked(store: SeedStore, seed: SeedState): Promise<SeedState> {
  const current = await store.load();
  if (current.status === 'dormant') return current;
  const updated: SeedState = { ...current, status: 'dormant', preDormantStatus: current.status, updatedAt: now() };
  await store.save(updated); await addEvent(store, updated, 'wither', 'Seed moved to dormancy.');
  return updated;
}

export async function wither(store: SeedStore, seed: SeedState): Promise<SeedState> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => witherUnlocked(store, seed));
}

async function wakeUnlocked(store: SeedStore, seed: SeedState): Promise<SeedState> {
  const current = await store.load();
  if (current.status !== 'dormant') return current;
  const previous = current.preDormantStatus && current.preDormantStatus !== 'dormant' ? current.preDormantStatus : 'growing';
  const { preDormantStatus: _discarded, ...rest } = current;
  const updated: SeedState = { ...rest, status: previous, updatedAt: now() };
  await store.save(updated); await addEvent(store, updated, 'wake', 'Seed woke from dormancy.');
  return updated;
}

export async function wake(store: SeedStore, seed: SeedState): Promise<SeedState> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => wakeUnlocked(store, seed));
}

async function restoreItemUnlocked(store: SeedStore, seed: SeedState, item: string): Promise<SeedState> {
  const currentSeed = await store.load();
  const branches = await store.branches(currentSeed.id);
  const requestedItem = item.trim();
  const normalizedRequested = requestedItem.toLocaleLowerCase();
  const target = branches.find((branch) => branch.id.toLocaleLowerCase() === normalizedRequested || branch.name.toLocaleLowerCase() === normalizedRequested);
  if (target) {
    const activeCount = branches.filter((branch) => branch.status === 'active').length;
    if (target.status !== 'pruned') throw new Error('restore-not-pruned');
    if (activeCount >= 5) throw new Error('too-many-branches');
    await store.saveBranch({ ...target, status: 'active', updatedAt: now() });
    const branchNames = new Set([target.name.trim().toLocaleLowerCase(), target.id.toLocaleLowerCase()]);
    const updated: SeedState = { ...currentSeed, activeBranch: currentSeed.activeBranch ?? target.id,
      coreIdea: removePruneNotes(currentSeed.coreIdea, [target.name, target.id]),
      prunedItems: currentSeed.prunedItems.filter((entry) => !branchNames.has(entry.trim().toLocaleLowerCase())),
      constraints: currentSeed.constraints.filter((entry) => {
        const normalized = entry.trim().toLocaleLowerCase();
        return ![...branchNames].some((name) => normalized === `pruned from mvp: ${name}`
          || normalized === `deferred from first version: ${name}`
          || normalized === `첫 버전에서 나중으로 미룸: ${name}`);
      }), status: statusAfterRestore(currentSeed), updatedAt: now() };
    await store.save(updated); await addEvent(store, updated, 'restore', `Restored branch: ${target.name}`, { branchId: target.id });
    return updated;
  }
  const normalizedItem = requestedItem.toLocaleLowerCase();
  const storedItem = currentSeed.prunedItems.find((entry) => entry.trim().toLocaleLowerCase() === normalizedItem);
  if (!storedItem) throw new Error('restore-not-found');
  const normalizedConstraints = new Set([
    `pruned from mvp: ${storedItem.trim().toLocaleLowerCase()}`,
    `deferred from first version: ${storedItem.trim().toLocaleLowerCase()}`,
    `첫 버전에서 나중으로 미룸: ${storedItem.trim().toLocaleLowerCase()}`,
  ]);
  const updated: SeedState = { ...currentSeed,
  coreIdea: removePruneNotes(currentSeed.coreIdea, [storedItem]),
    prunedItems: currentSeed.prunedItems.filter((entry) => entry.trim().toLocaleLowerCase() !== normalizedItem),
    constraints: currentSeed.constraints.filter((entry) => !normalizedConstraints.has(entry.trim().toLocaleLowerCase())),
  status: statusAfterRestore(currentSeed), updatedAt: now() };
  await store.save(updated); await addEvent(store, updated, 'restore', `Restored item: ${storedItem}`); return updated;
}

export async function restoreItem(store: SeedStore, seed: SeedState, item: string): Promise<SeedState> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => restoreItemUnlocked(store, seed, item));
}
