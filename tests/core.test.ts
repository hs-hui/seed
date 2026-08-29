import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SeedStore } from '../src/storage/store.js';
import { plant } from '../src/core/seed-manager.js';
import { applyGrowth, askGrowthQuestion } from '../src/core/growth.js';
import { calculateMaturity } from '../src/core/maturity.js';
import { harvest } from '../src/core/harvest.js';

describe('Seed MVP flow', () => {
  it('plants, grows, and preserves conversations/history', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-test-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '  A repository guide for new developers  ');
      expect(seed.originalIdea).toBe('A repository guide for new developers');
      const question = await askGrowthQuestion(store, seed);
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
      expect(prd).toContain('## 13. Open Questions'); expect(trd).toContain('## 21. Future Scalability');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
