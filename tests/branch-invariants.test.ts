import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSeed, type Branch } from '../src/domain.js';
import { assertBranchLineage } from '../src/domain/branch-invariants.js';
import { SeedStore } from '../src/storage/store.js';

const branch = (id: string, seedId: string, parentBranchId?: string): Branch => ({
  id, seedId, parentBranchId, name: id, slug: id, summary: id, direction: id,
  status: 'active', maturity: 5, assumptions: [], decisions: [], openQuestions: [], createdAt: '', updatedAt: '',
});

describe('branch lineage', () => {
  it('accepts a parent from the same seed', () => {
    expect(() => assertBranchLineage(branch('child', 'seed', 'root'), [branch('root', 'seed')])).not.toThrow();
  });
  it('rejects missing, foreign, and cyclic parent links', () => {
    expect(() => assertBranchLineage(branch('child', 'seed', 'missing'), [])).toThrow('branch-parent-invalid');
    expect(() => assertBranchLineage(branch('child', 'seed', 'root'), [branch('root', 'other')])).toThrow('branch-parent-invalid');
    expect(() => assertBranchLineage(branch('child', 'seed', 'child'), [])).toThrow('branch-parent-cycle');
    expect(() => assertBranchLineage(branch('child', 'seed', 'root'), [branch('root', 'seed', 'child')])).toThrow('branch-parent-cycle');
  });

  it('enforces lineage at the storage write boundary', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-branch-lineage-'));
    try {
      const store = new SeedStore(root);
      await store.create(createSeed('A seed'));
      await store.saveBranch(branch('root', 'seed'));
      await store.saveBranch(branch('child', 'seed', 'root'));
      await expect(store.saveBranch(branch('root', 'seed', 'child'))).rejects.toThrow('branch-parent-cycle');
      await expect(store.saveBranch(branch('foreign', 'other', 'root'))).rejects.toThrow('branch-parent-invalid');
      expect((await store.branches('seed')).find((item) => item.id === 'root')?.parentBranchId).toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
