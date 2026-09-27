import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { coreAI } from '../src/core/ai.js';
import { askGrowthQuestion } from '../src/core/growth.js';
import { SeedStore } from '../src/storage/store.js';
import { plant } from '../src/core/seed-manager.js';

describe('core AI port', () => {
  it('can ask a question through a substituted AI operation without credentials', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-ai-port-'));
    const question = vi.spyOn(coreAI, 'nextQuestion').mockResolvedValue({ question: 'Who needs this?', maturityDelta: 3, focus: 'user' });
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, 'A small idea');
      expect(await askGrowthQuestion(store, seed)).toBe('Who needs this?');
      expect(question).toHaveBeenCalledOnce();
    } finally { question.mockRestore(); await rm(root, { recursive: true, force: true }); }
  });
});
