import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SeedStore } from '../src/storage/store.js';
import { plant, recordDecision } from '../src/core/seed-manager.js';
import { applyGrowth, askGrowthQuestion } from '../src/core/growth.js';
import { createBranch, pruneItem } from '../src/core/branch.js';
import { harvest } from '../src/core/harvest.js';
import { restoreItem } from '../src/core/lifecycle.js';
import { useScriptedProvider } from './test-support/scripted-provider.js';

describe('harvested status is kept by growth-state commands', () => {
  let stopScriptedProvider: () => Promise<void>;
  beforeEach(async () => { stopScriptedProvider = await useScriptedProvider(); });
  afterEach(async () => { await stopScriptedProvider(); });

  it('stays harvested through branch, prune, grow, decision and restore', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-status-harvested-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A harvested status idea');
      await harvest(store, seed, 'idea', 'en');
      expect((await store.load()).status).toBe('harvested');
      await createBranch(store, await store.load(), 'Optional path', 'An optional path');
      expect((await store.load()).status).toBe('harvested');
      await pruneItem(store, await store.load(), 'Optional path');
      expect((await store.load()).status).toBe('harvested');
      await askGrowthQuestion(store, await store.load(), 'openai');
      await applyGrowth(store, await store.load(), 'A focused answer for the first user', 'openai');
      expect((await store.load()).status).toBe('harvested');
      await recordDecision(store, await store.load(), 'Keep the focused path');
      expect((await store.load()).status).toBe('harvested');
      await restoreItem(store, await store.load(), 'Optional path');
      expect((await store.load()).status).toBe('harvested');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
