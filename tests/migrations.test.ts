import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSeed, SEED_VERSION } from '../src/domain.js';
import { migrateSeed } from '../src/storage/migrations.js';
import { SeedStore } from '../src/storage/store.js';

describe('Seed state migration boundary', () => {
  it('accepts the current schema without changing the persisted data', () => {
    const state = createSeed('A stable idea');
    expect(migrateSeed(state)).toEqual(state);
  });

  it('rejects unknown and older versions explicitly', () => {
    const state = createSeed('An idea');
    expect(() => migrateSeed({ ...state, version: 0 })).toThrow('seed-version-unsupported');
    expect(() => migrateSeed({ ...state, version: SEED_VERSION + 1 })).toThrow('seed-version-newer');
  });

  it('never overwrites a newer state with an older backup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-future-version-'));
    try {
      const store = new SeedStore(root);
      const state = createSeed('An idea');
      await store.create(state);
      const file = path.join(store.base, 'seed.json');
      const future = JSON.stringify({ ...state, version: SEED_VERSION + 1 });
      await writeFile(file, future);
      await expect(store.load()).rejects.toThrow('seed-version-newer');
      expect(await readFile(file, 'utf8')).toBe(future);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('recovers a damaged state from the last valid backup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-recovery-'));
    try {
      const store = new SeedStore(root);
      const state = createSeed('An idea');
      await store.create(state);
      await store.save({ ...state, coreIdea: 'A later idea' });
      const file = path.join(store.base, 'seed.json');
      await writeFile(file, '{broken');
      expect((await store.load()).coreIdea).toBe(state.coreIdea);
      expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ coreIdea: state.coreIdea });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps overlapping state saves and their rolling backup in order', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-save-order-'));
    try {
      const store = new SeedStore(root);
      const state = createSeed('An idea');
      await store.create(state);
      await Promise.all([
        store.save({ ...state, coreIdea: 'First update' }),
        store.save({ ...state, coreIdea: 'Second update' }),
      ]);
      expect((await store.load()).coreIdea).toBe('Second update');
      const backup = JSON.parse(await readFile(path.join(store.base, '.backup', 'seed.json.bak'), 'utf8'));
      expect(backup.coreIdea).toBe('First update');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
