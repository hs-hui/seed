import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SeedStore } from '../src/storage/store.js';
import { createSeed, emptyDimensions } from '../src/domain.js';
import { plant, recordDecision, addConversation } from '../src/core/seed-manager.js';
import { createBranch, pruneItem } from '../src/core/branch.js';
import { restoreItem, wither } from '../src/core/lifecycle.js';
import { harvest } from '../src/core/harvest.js';
import { registerSunlightCommand } from '../src/cli/sunlight-command.js';
import { registerBloomCommand } from '../src/cli/bloom-command.js';
import * as provider from '../src/ai/provider.js';
import { Command } from 'commander';

afterEach(() => vi.restoreAllMocks());
const execFileAsync = promisify(execFile);

describe('code review regressions', () => {
  it('serializes state mutations across CLI processes, including new directories', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-process-lock-'));
    try {
      const file = path.join(root, '.seed', 'counter.json');
      const moduleUrl = pathToFileURL(path.resolve('src/utils/fs.ts')).href;
      const script = `import { withKeyedLock, atomicWrite } from ${JSON.stringify(moduleUrl)};
        import { readFile } from 'node:fs/promises';
        const file = ${JSON.stringify(file)};
        for (let i = 0; i < 5; i++) await withKeyedLock(file, async () => {
          let value = 0;
          try { value = JSON.parse(await readFile(file, 'utf8')); } catch {}
          await new Promise(resolve => setTimeout(resolve, 5));
          await atomicWrite(file, JSON.stringify(value + 1));
        });`;
      await Promise.all(Array.from({ length: 3 }, () => execFileAsync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script])));
      expect(JSON.parse(await readFile(file, 'utf8'))).toBe(15);
      expect((await readdir(path.dirname(file))).filter(name => name.endsWith('.lock'))).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('preserves a long product idea through prune and restore', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-long-prune-'));
    try {
      const store = new SeedStore(root);
      const idea = 'A'.repeat(260) + ' KEEP THIS REQUIREMENT';
      const seed = await plant(store, idea);
      const pruned = await pruneItem(store, seed, 'Payments');
      expect(pruned.coreIdea).toBe(idea);
      expect(pruned.prunedItems).toContain('Payments');
      expect((await restoreItem(store, pruned, 'Payments')).coreIdea).toBe(idea);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('excludes pruned branch evidence and renders product UX rather than Seed UX', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-evidence-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, 'Medication reminder');
      await store.save({ ...seed, goals: ['Take medication on time'] });
      const branch = await createBranch(store, seed, 'Discarded mobile direction', 'Mobile exploration');
      await recordDecision(store, seed, 'Use Flutter', 'For the discarded direction', branch.id);
      await addConversation(store, { seedId: seed.id, branchId: branch.id, role: 'user', type: 'answer', content: 'DISCARDED_ANSWER' });
      await pruneItem(store, seed, branch.id);
      for (const lang of ['en', 'ko'] as const) {
        for (const type of ['prd', 'prompt', 'trd'] as const) {
          const file = await harvest(store, await store.load(), type, lang);
          const content = await readFile(file as string, 'utf8');
          expect(content).not.toContain('Use Flutter');
          expect(content).not.toContain('DISCARDED_ANSWER');
          expect(content).not.toContain('Seed asks one focused question');
          expect(content).not.toContain('Seed가 한 번에 하나의 핵심 질문을 합니다.');
          if (type === 'prd') expect(content).toContain('Take medication on time');
        }
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  for (const command of ['sunlight', 'bloom'] as const) {
    it(`preserves a decision recorded during ${command} analysis`, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'seed-analysis-merge-'));
      try {
        const store = new SeedStore(root);
        const seed = await plant(store, 'A product');
        const duringAnalysis = async () => { await recordDecision(store, seed, 'Keep this decision'); };
        if (command === 'sunlight') vi.spyOn(provider, 'sunlightAnalysis').mockImplementation(async () => {
          await duringAnalysis(); return { areas: [], assumptions: [], openQuestions: [] };
        });
        else vi.spyOn(provider, 'evaluateMaturity').mockImplementation(async () => {
          await duringAnalysis(); return { dimensions: emptyDimensions(), clear: [], uncertain: [], explore: [] };
        });
        const program = new Command();
        const deps = { addCommon: (c: Command) => c.option('--json'), run: async (action: () => Promise<void>) => action(), targetStore: async () => store, currentSeed: async () => store.load(), print: () => {} };
        (command === 'sunlight' ? registerSunlightCommand : registerBloomCommand)(program, deps);
        await program.parseAsync(['node', 'seed', command, '--json']);
        expect((await store.load()).decisions.map(d => d.decision)).toContain('Keep this decision');
      } finally { await rm(root, { recursive: true, force: true }); }
    });

    it(`does not wake a seed made dormant during ${command} analysis`, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'seed-analysis-dormant-'));
      try {
        const store = new SeedStore(root);
        const seed = createSeed('A product'); await store.create(seed);
        if (command === 'sunlight') vi.spyOn(provider, 'sunlightAnalysis').mockImplementation(async () => {
          await wither(store, seed); return { areas: [], assumptions: [], openQuestions: [] };
        });
        else vi.spyOn(provider, 'evaluateMaturity').mockImplementation(async () => {
          await wither(store, seed); return { dimensions: emptyDimensions(), clear: [], uncertain: [], explore: [] };
        });
        const program = new Command();
        const deps = { addCommon: (c: Command) => c, run: async (action: () => Promise<void>) => action(), targetStore: async () => store, currentSeed: async () => store.load(), print: () => {} };
        (command === 'sunlight' ? registerSunlightCommand : registerBloomCommand)(program, deps);
        await expect(program.parseAsync(['node', 'seed', command])).rejects.toThrow('seed-dormant');
        expect((await store.load()).status).toBe('dormant');
      } finally { await rm(root, { recursive: true, force: true }); }
    });
  }
});
