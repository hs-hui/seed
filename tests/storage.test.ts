import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendJsonLine, atomicWrite, ensureLine } from '../src/utils/fs.js';
import { SeedStore, loadConfig, saveConfig, saveProjectConfig } from '../src/storage/store.js';
import { plant } from '../src/core/seed-manager.js';
import { createSeed } from '../src/domain.js';

describe('atomic storage writes', () => {
  it('keeps overlapping writes complete and cleans staging files', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-atomic-write-'));
    try {
      const file = path.join(root, 'state.json');
      await Promise.all(Array.from({ length: 12 }, (_, index) => atomicWrite(file, JSON.stringify({ index, complete: true }))));
      const saved = JSON.parse(await readFile(file, 'utf8')) as { index: number; complete: boolean };
      expect(saved.complete).toBe(true);
      expect(saved.index).toBeGreaterThanOrEqual(0);
      expect(saved.index).toBeLessThan(12);
      expect((await readdir(root)).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('serializes concurrent history appends without losing events', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-append-write-'));
    try {
      const file = path.join(root, 'history', 'events.jsonl');
      await Promise.all(Array.from({ length: 24 }, (_, index) => appendJsonLine(file, { index })));
      const lines = (await readFile(file, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as { index: number });
      expect(lines).toHaveLength(24);
      expect(new Set(lines.map((line) => line.index)).size).toBe(24);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps the rolling Seed backup valid during overlapping saves', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-overlapping-saves-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, 'A concurrent idea');
      await Promise.all(Array.from({ length: 8 }, (_, index) => store.save({ ...seed, coreIdea: `version-${index}` })));
      const current = await store.load();
      const rolling = JSON.parse(await readFile(path.join(store.base, '.backup', 'seed.json.bak'), 'utf8')) as { coreIdea?: string; id?: string };
      expect(current.coreIdea).toMatch(/^version-[0-7]$/);
      expect(rolling.id).toBe(seed.id);
      expect(rolling.coreIdea).toMatch(/^version-[0-7]$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('returns history events in timestamp order', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-history-order-'));
    try {
      const store = new SeedStore(root);
      const seed = createSeed('A history idea');
      await store.create(seed);
      await store.appendEvent({ id: 'late', seedId: seed.id, type: 'grow', message: 'late', createdAt: '2026-08-30T00:00:02.000Z' });
      await store.appendEvent({ id: 'early', seedId: seed.id, type: 'plant', message: 'early', createdAt: '2026-08-30T00:00:01.000Z' });
      expect((await store.events(seed.id)).map((event) => event.id)).toEqual(['early', 'late']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('does not lose a shared gitignore line during concurrent setup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-gitignore-write-'));
    try {
      const file = path.join(root, '.gitignore');
      await Promise.all([ensureLine(file, '.seed/'), ensureLine(file, '# Seed - idea growth tool'), ensureLine(file, '.seed/')]);
      const lines = (await readFile(file, 'utf8')).split(/\r?\n/).map((line) => line.trim());
      expect(lines).toContain('.seed/');
      expect(lines).toContain('# Seed - idea growth tool');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('validates research records before writing them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-research-schema-'));
    try {
      const store = new SeedStore(root);
      await expect(store.saveResearch({ id: 'bad', seedId: 'bad', source: 'user', title: 'Broken', summary: 'Broken', relevance: 'unknown' as never, retrievedAt: '', isVerified: false, isEstimate: true })).rejects.toThrow();
      expect(await readdir(path.join(root, '.seed', 'research')).catch(() => [])).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('validates harvest results before writing them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-schema-'));
    try {
      const store = new SeedStore(root);
      const seed = createSeed('A harvest test');
      await store.create(seed);
      await expect(store.saveHarvestResult({
        id: 'bad', seedId: seed.id, type: 'not-a-harvest' as never, version: 0,
        content: '', createdAt: '', maturitySnapshot: 101,
      })).rejects.toThrow();
      expect(await readdir(path.join(root, '.seed', 'harvest', 'results'))).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('recovers a damaged seed file from the rolling backup', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-storage-recovery-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A recoverable idea');
      await store.save({ ...seed, coreIdea: 'A newer idea' });
      await writeFile(path.join(store.base, 'seed.json'), '{broken', 'utf8');
      const recovered = await store.load();
      expect(recovered.coreIdea).toBe(seed.coreIdea);
      expect(JSON.parse(await readFile(path.join(store.base, 'seed.json'), 'utf8')).coreIdea).toBe(seed.coreIdea);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('recognizes a missing current file when its backup is recoverable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-storage-missing-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A preserved idea');
      await store.save({ ...seed, coreIdea: 'A newer idea' });
      await rm(path.join(store.base, 'seed.json'));
      expect(await store.hasSeed()).toBe(true);
      expect((await store.load()).coreIdea).toBe(seed.coreIdea);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('writes a project-scoped config override inside a Seed project', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-project-config-'));
    const home = await mkdtemp(path.join(os.tmpdir(), 'seed-project-config-home-'));
    const previousCwd = process.cwd();
    const previousHome = process.env.SEED_HOME;
    process.env.SEED_HOME = home;
    try {
      process.chdir(root);
      await plant(new SeedStore(root), 'A project-specific provider setup');
      const config = await loadConfig();
      config.lang = 'ko';
      expect(await saveProjectConfig(config)).toBe(true);
      const saved = JSON.parse(await readFile(path.join(root, '.seed', 'config.json'), 'utf8')) as { lang?: string };
      expect(saved.lang).toBe('ko');
      expect((await loadConfig()).lang).toBe('ko');
    } finally {
      process.chdir(previousCwd);
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
      await rm(home, { recursive: true, force: true });
    }
  });
});
