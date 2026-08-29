import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalProvider, OpenAICompatibleProvider } from '../src/ai/provider.js';
import { askGrowthQuestion, applyGrowth } from '../src/core/growth.js';
import { plant } from '../src/core/seed-manager.js';
import { SeedStore } from '../src/storage/store.js';

describe('AI language handling', () => {
  it('returns Korean local fallback suggestions when Korean is selected', async () => {
    const provider = new LocalProvider('ko');
    const result = JSON.parse(await provider.ask('GROW_QUESTION\nproblem: \nusers: \nopenQuestions: ')) as { question: string };
    expect(result.question).toContain('아이디어');
  });

  it('sends the selected language to an OpenAI-compatible provider', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(body.messages[0]?.content).toContain('Respond in Korean');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"한국어 질문","maturityDelta":3}' } }] }), { status: 200 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const provider = new OpenAICompatibleProvider({ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'gpt-test', enabled: true }, 'test-key', 'ko');
      expect(await provider.ask('Return JSON')).toContain('한국어 질문');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('understands answers to Korean user/problem questions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-ko-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '개발자를 돕는 안내 도구');
      const question = await askGrowthQuestion(store, seed, undefined, undefined, undefined, 'ko');
      const prompted = await store.load();
      expect(question).toContain('아이디어');
      const result = await applyGrowth(store, prompted, '처음에는 저장소를 처음 보는 개발자가 가장 힘들어합니다.');
      expect(result.seed.users).toContain('처음에는 저장소를 처음 보는 개발자가 가장 힘들어합니다.');
      expect(result.seed.problem).toBe('처음에는 저장소를 처음 보는 개발자가 가장 힘들어합니다.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
