import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SeedStore } from '../src/storage/store.js';
import { plant, recordDecision } from '../src/core/seed-manager.js';
import { applyGrowth, askGrowthQuestion } from '../src/core/growth.js';
import { createBranch, pruneItem } from '../src/core/branch.js';
import { harvest } from '../src/core/harvest.js';
import { restoreItem, wake, wither } from '../src/core/lifecycle.js';
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
      await recordDecision(store, 'Keep the focused path');
      expect((await store.load()).status).toBe('harvested');
      await restoreItem(store, await store.load(), 'Optional path');
      expect((await store.load()).status).toBe('harvested');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('growth-state core functions read the stored seed', () => {
  let stopScriptedProvider: () => Promise<void>;
  beforeEach(async () => { stopScriptedProvider = await useScriptedProvider(); });
  afterEach(async () => { await stopScriptedProvider(); });

  it('records a decision from the stored state alone', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-decision-signature-'));
    try {
      const store = new SeedStore(root); await plant(store, 'A stored decision idea');
      const result = await recordDecision(store, 'Keep the small loop');
      expect(result.decision.decision).toBe('Keep the small loop');
      expect((await store.load()).decisions).toHaveLength(1);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('ignores a caller snapshot and uses the stored state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-snapshot-'));
    try {
      const store = new SeedStore(root); await plant(store, 'A stored snapshot idea');
      // The seed slot is kept for call-site compatibility and must never be read.
      const stale = undefined as never;
      await askGrowthQuestion(store, stale, 'openai');
      await applyGrowth(store, stale, 'A focused answer for the first user', 'openai');
      const branch = await createBranch(store, stale, 'Optional path', 'An optional path');
      await pruneItem(store, stale, 'Optional path');
      expect((await store.branches((await store.load()).id)).find((item) => item.id === branch.id)?.status).toBe('pruned');
      const dormant = await wither(store, stale);
      expect(dormant.status).toBe('dormant');
      expect((await wake(store, stale)).status).not.toBe('dormant');
      await restoreItem(store, stale, 'Optional path');
      expect((await store.branches((await store.load()).id)).find((item) => item.id === branch.id)?.status).toBe('active');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
