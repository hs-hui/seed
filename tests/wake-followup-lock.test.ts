import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SeedStore } from '../src/storage/store.js';
import { createSeed } from '../src/domain.js';
import { withKeyedLock } from '../src/utils/fs.js';
import { appendWakeFollowUp } from '../src/core/followup.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('wake follow-up persistence', () => {
  it('reads the latest seed inside the state lock so a concurrent mutation survives', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-wake-lock-'));
    roots.push(root);
    const store = new SeedStore(root);
    await store.create(createSeed('A seed that wakes up after a pause'));
    const statePath = path.join(store.base, 'seed.json');

    // Hold the keyed lock while a concurrent mutation loads, pauses, then saves.
    // The follow-up must wait for the lock and see the mutation, not the stale snapshot.
    let releaseMutation!: () => void;
    const gate = new Promise<void>((resolve) => { releaseMutation = resolve; });
    const mutation = withKeyedLock(statePath, async () => {
      const current = await store.load();
      await gate;
      await store.save({ ...current, assumptions: [...current.assumptions, 'Concurrent assumption'], updatedAt: new Date().toISOString() });
    });

    const followUp = appendWakeFollowUp(store, 'What changed while the seed rested?');
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseMutation();
    await Promise.all([mutation, followUp]);

    const saved = await store.load();
    expect(saved.assumptions).toEqual(['Concurrent assumption']);
    expect(saved.openQuestions).toHaveLength(1);
    expect(saved.openQuestions[0]).toMatchObject({ question: 'What changed while the seed rested?', status: 'open', focus: 'validation', importance: 'medium', seedId: saved.id });
  });

  it('keeps earlier open questions when appending the wake question', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-wake-append-'));
    roots.push(root);
    const store = new SeedStore(root);
    const seed = createSeed('A seed with an existing question');
    await store.create({ ...seed, openQuestions: [{ id: 'existing', seedId: seed.id, question: 'Earlier?', focus: 'validation', importance: 'low', status: 'open', createdAt: seed.createdAt }] });

    const updated = await appendWakeFollowUp(store, 'Still relevant?');
    const saved = await store.load();
    expect(updated.openQuestions.map((question) => question.question)).toEqual(['Earlier?', 'Still relevant?']);
    expect(saved.openQuestions.map((question) => question.question)).toEqual(['Earlier?', 'Still relevant?']);
  });
});
