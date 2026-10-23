import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { growthUpdate, nextQuestion, suggestBranches, suggestPrune } from '../src/ai/provider.js';
import { containsBeginnerJargon } from '../src/ai/response-guard.js';
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

  it('keeps a valid AI question when the provider omits focus', async () => {
    const response = JSON.stringify({ question: 'Who would use this study app first?', maturityDelta: 4 });
    const question = await withMockedOpenAI(response, () => nextQuestion(seed, 'openai', undefined, 'en'));
    expect(question).toEqual({ question: 'Who would use this study app first?', maturityDelta: 4, focus: 'user' });
  });

  it('still replaces an omitted-focus question that fails the jargon check', async () => {
    const response = JSON.stringify({ question: 'Which MVP roadmap milestone matters first?', maturityDelta: 3 });
    const question = await withMockedOpenAI(response, () => nextQuestion(seed, 'openai', undefined, 'en'));
    expect(question.question).not.toContain('MVP');
    expect(question.focus).toBe('user');
  });

  it('does not flag ordinary words that the user typed themselves', () => {
    expect(containsBeginnerJargon('가정에서 가계부를 언제 쓰세요?', 'ko', '가정에서 가계부를 쓰고 싶어요')).toBe(false);
    expect(containsBeginnerJargon('신호등을 기다릴 때 무엇을 하나요?', 'ko', '신호등 앞에서 기다리는 시간이 아까워요')).toBe(false);
    expect(containsBeginnerJargon('우선순위를 정할 때 가장 힘든 순간은 언제예요?', 'ko', '우선순위 정하기가 가장 힘들어요')).toBe(false);
    expect(containsBeginnerJargon('Who checks the risk of a hiking route first?', 'en', 'Hikers want a risk checker before the trip')).toBe(false);
    expect(containsBeginnerJargon('When do you set the priority of a task?', 'en', 'Students need a priority list for tasks')).toBe(false);
  });

  it('keeps flagging jargon the user did not write, even when other words are theirs', () => {
    expect(containsBeginnerJargon('이 가정을 검증할 전략을 세우시겠어요?', 'ko')).toBe(true);
    expect(containsBeginnerJargon('우선순위를 정할 때 가장 힘든 순간은 언제예요?', 'ko')).toBe(true);
    expect(containsBeginnerJargon('What is the risk of this idea?', 'en')).toBe(true);
    expect(containsBeginnerJargon('When do you set the priority of a task?', 'en')).toBe(true);
    expect(containsBeginnerJargon('우선순위를 정할 때 MVP 범위는 어디까지예요?', 'ko', '우선순위를 정해요')).toBe(true);
  });

  it('narrows the Korean assumption term to planning language', () => {
    expect(containsBeginnerJargon('가정에서 가계부를 언제 쓰세요?', 'ko')).toBe(false);
    expect(containsBeginnerJargon('이 가정을 세우는 데 무엇이 필요할까요?', 'ko')).toBe(true);
  });

  it('keeps a valid AI question that reuses a word from the user idea', async () => {
    const koreanSeed = createSeed('신호등 앞에서 기다리는 시간을 줄이는 앱');
    const response = JSON.stringify({ question: '신호등을 기다릴 때 무엇을 하나요?', maturityDelta: 3, focus: 'user' });
    const question = await withMockedOpenAI(response, () => nextQuestion(koreanSeed, 'openai', undefined, 'ko'));
    expect(question.question).toBe('신호등을 기다릴 때 무엇을 하나요?');
  });

  it('keeps a growth summary that reuses a word the user wrote', async () => {
    const hikingSeed = createSeed('A hiking route app that shows the risk of each trail');
    const response = JSON.stringify({ updatedSummary: 'Hikers check the risk of each route.', questionReason: 'Reflected.', contradictionsDetected: [], suggestions: [], maturityDelta: 3 });
    const update = await withMockedOpenAI(response, () => growthUpdate(hikingSeed, 'Hikers check the risk first.', 'openai', undefined, 'en'));
    expect(update.updatedSummary).toBe('Hikers check the risk of each route.');
  });

  it('accepts a growth reply that uses the summary field', async () => {
    const response = JSON.stringify({ summary: 'A study app for students who need shorter sessions.', maturityDelta: 4 });
    const update = await withMockedOpenAI(response, () => growthUpdate(seed, 'Students need a shorter study session.', 'openai', undefined, 'en'));
    expect(update.updatedSummary).toBe('A study app for students who need shorter sessions.');
  });
});
