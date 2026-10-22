import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { growthUpdate, suggestBranches, suggestPrune } from '../src/ai/provider.js';
import { createSeed } from '../src/domain.js';

async function withMockedOpenAI<T>(responseContent: string, run: () => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'seed-response-validation-'));
  const previousHome = process.env.SEED_HOME;
  const previousKey = process.env.SEED_OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.SEED_HOME = root;
  process.env.SEED_OPENAI_API_KEY = 'test-key';
  await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: responseContent } }] }), { status: 200 })) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
    if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
    await rm(root, { recursive: true, force: true });
  }
}

describe('provider response validation', () => {
  const seed = createSeed('A study app');

  it('rejects a branch reply whose branches field has the wrong shape with the friendly error code', async () => {
    await expect(withMockedOpenAI('{"branches":"none"}', () => suggestBranches(seed, 'openai', undefined, 'en'))).rejects.toThrow('ai-response-invalid');
  });

  it('rejects a prune reply whose items field has the wrong shape with the friendly error code', async () => {
    await expect(withMockedOpenAI('{"items":"none"}', () => suggestPrune(seed, 'openai', undefined, 'en'))).rejects.toThrow('ai-response-invalid');
  });

  it('rejects a non-JSON prune reply instead of silently returning nothing', async () => {
    await expect(withMockedOpenAI('Sorry, I cannot help with that.', () => suggestPrune(seed, 'openai', undefined, 'en'))).rejects.toThrow('ai-response-invalid');
  });

  it('keeps valid branch suggestions and skips malformed entries', async () => {
    const response = JSON.stringify({ branches: [{ name: 'Teacher view', summary: 'Show progress to teachers.' }, { name: 42 }, { name: 'Parent view', summary: 'Show weekly study time.' }] });
    const branches = await withMockedOpenAI(response, () => suggestBranches(seed, 'openai', undefined, 'en'));
    expect(branches.map((branch) => branch.name)).toEqual(['Teacher view', 'Parent view']);
  });

  it('still limits valid branch suggestions to four', async () => {
    const response = JSON.stringify({ branches: Array.from({ length: 6 }, (_, index) => ({ name: `Option ${index}`, summary: 'A small step.' })) });
    const branches = await withMockedOpenAI(response, () => suggestBranches(seed, 'openai', undefined, 'en'));
    expect(branches).toHaveLength(4);
  });

  it('keeps an empty prune list as a valid answer', async () => {
    const items = await withMockedOpenAI('{"items":[]}', () => suggestPrune(seed, 'openai', undefined, 'en'));
    expect(items).toEqual([]);
  });

  it('filters prune items that carry beginner jargon while keeping plain ones', async () => {
    const response = JSON.stringify({ items: [{ item: 'Drop the MVP roadmap', reason: 'Too early.' }, { item: 'Drop the chat feature', reason: 'Not needed yet.' }] });
    const items = await withMockedOpenAI(response, () => suggestPrune(seed, 'openai', undefined, 'en'));
    expect(items).toEqual([{ item: 'Drop the chat feature', reason: 'Not needed yet.' }]);
  });

  it('rejects an empty or non-JSON growth reply so no maturity is recorded for it', async () => {
    await expect(withMockedOpenAI('', () => growthUpdate(seed, 'Students need a shorter study session.', 'openai', undefined, 'en'))).rejects.toThrow('ai-response-invalid');
    await expect(withMockedOpenAI('Thanks, that is helpful.', () => growthUpdate(seed, 'Students need a shorter study session.', 'openai', undefined, 'en'))).rejects.toThrow('ai-response-invalid');
  });

  it('rejects a growth JSON object without a non-empty summary', async () => {
    const response = JSON.stringify({ updatedSummary: '   ', questionReason: 'Reflected.', maturityDelta: 3 });
    await expect(withMockedOpenAI(response, () => growthUpdate(seed, 'Students need a shorter study session.', 'openai', undefined, 'en'))).rejects.toThrow('ai-response-invalid');
    await expect(withMockedOpenAI('{"maturityDelta":3}', () => growthUpdate(seed, 'Students need a shorter study session.', 'openai', undefined, 'en'))).rejects.toThrow('ai-response-invalid');
  });

  it('accepts a growth reply that uses the summary field', async () => {
    const response = JSON.stringify({ summary: 'A study app for students who need shorter sessions.', maturityDelta: 4 });
    const update = await withMockedOpenAI(response, () => growthUpdate(seed, 'Students need a shorter study session.', 'openai', undefined, 'en'));
    expect(update.updatedSummary).toBe('A study app for students who need shorter sessions.');
  });
});
