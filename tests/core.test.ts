import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SeedStore } from '../src/storage/store.js';
import { plant } from '../src/core/seed-manager.js';
import { applyGrowth, askGrowthQuestion } from '../src/core/growth.js';
import { calculateMaturity } from '../src/core/maturity.js';
import { harvest } from '../src/core/harvest.js';
import { branchSuggestions, createBranch, pruneItem } from '../src/core/branch.js';
import { dimensionsFor } from '../src/ai/provider.js';
import { statusForMaturity } from '../src/core/maturity.js';

describe('Seed MVP flow', () => {
  it('plants, grows, and preserves conversations/history', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-test-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '  A repository guide for new developers  ');
      expect(seed.originalIdea).toBe('A repository guide for new developers');
      const question = await askGrowthQuestion(store, seed, 'local');
      const prompted = await store.load();
      expect(prompted.openQuestions.some((entry) => entry.question === question && entry.status === 'open')).toBe(true);
      const result = await applyGrowth(store, prompted, 'Help a developer find the right starting point.');
      expect(result.seed.coreIdea).toContain('Help a developer');
      expect(result.seed.maturity).toBeGreaterThan(0);
      expect((await store.conversations(seed.id)).length).toBe(3);
      expect((await store.load()).openQuestions.every((entry) => entry.status === 'answered')).toBe(true);
      expect((await store.events(seed.id)).map((event) => event.type)).toEqual(['plant', 'grow']);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('rejects an empty idea', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-empty-'));
    try { await expect(plant(new SeedStore(root), '   ')).rejects.toThrow('idea-required'); }
    finally { await rm(root, { recursive: true, force: true }); }
  });

  it('calculates maturity with open-question penalty and decision bonus', () => {
    const dimensions = Array.from({ length: 8 }, (_, index) => ({ name: String(index), score: 80, reason: '' }));
    const seed = {
      version: 1, id: 'seed', name: 'seed', status: 'growing' as const, maturity: 80,
      maturityDimensions: dimensions, originalIdea: 'x', coreIdea: 'x', problem: '', users: [], goals: [], constraints: [], branches: [], prunedItems: [], assumptions: [],
      decisions: [{ id: 'd', seedId: 'seed', decision: 'x', reason: 'x', source: 'x', confirmedByUser: true, createdAt: '' }],
      openQuestions: [{ id: 'q', seedId: 'seed', question: 'x', importance: 'high' as const, status: 'open' as const, createdAt: '' }], createdAt: '', updatedAt: '',
    };
    expect(calculateMaturity(seed)).toBe(77);
  });

  it('versions harvested markdown without overwriting', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      const one = await harvest(store, seed, 'idea', 'en'); const two = await harvest(store, seed, 'idea', 'en');
      expect(one).toMatch(/idea-v1\.md$/); expect(two).toMatch(/idea-v2\.md$/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('harvests all document types with the required PRD/TRD sections', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-all-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A small idea');
      const files = await harvest(store, seed, 'all', 'en');
      expect(files).toHaveLength(6);
      const { readFile } = await import('node:fs/promises');
      const prd = await readFile(files.find((file) => file.endsWith('prd-v1.md'))!, 'utf8');
      const trd = await readFile(files.find((file) => file.endsWith('trd-v1.md'))!, 'utf8');
      for (const section of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '## 10.', '## 11.', '## 12.', '## 13.']) expect(prd).toContain(section);
      for (const section of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '## 10.', '## 11.', '## 12.', '## 13.', '## 14.', '## 15.', '## 16.', '## 17.', '## 18.', '## 19.', '## 20.', '## 21.']) expect(trd).toContain(section);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('keeps branches independent and enforces the active branch limit', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'Explore a developer workflow');
      const suggestions = await branchSuggestions(seed, 'local'); expect(suggestions.length).toBeGreaterThanOrEqual(2); expect(suggestions.length).toBeLessThanOrEqual(4);
      let current = await createBranch(store, seed, suggestions[0]!.name, suggestions[0]!.summary);
      let latest = await store.load();
      for (let index = 1; index < 5; index += 1) { const suggestion = suggestions[index % suggestions.length]!; await createBranch(store, latest, `${suggestion.name}-${index}`, suggestion.summary); latest = await store.load(); }
      await expect(createBranch(store, latest, 'Overflow', 'Too broad')).rejects.toThrow('too-many-branches');
      expect((await store.branches(seed.id)).filter((branch) => branch.status === 'active')).toHaveLength(5);
      const pruned = await pruneItem(store, latest, current.id); expect(pruned.activeBranch).not.toBe(current.id); expect((await store.branches(seed.id)).find((branch) => branch.id === current.id)?.status).toBe('pruned');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('evaluates all maturity dimensions and maps the bloom state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-bloom-'));
    try {
      const store = new SeedStore(root); const seed = await plant(store, 'A focused project');
      const updated = { ...seed, problem: 'A concrete problem', users: ['developers'], goals: ['a useful outcome'], maturityDimensions: dimensionsFor({ ...seed, problem: 'A concrete problem', users: ['developers'], goals: ['a useful outcome'] }) };
      expect(updated.maturityDimensions).toHaveLength(8); expect(statusForMaturity(85)).toBe('mature');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
