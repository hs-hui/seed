import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalProvider, OpenAICompatibleProvider, evaluateMaturity } from '../src/ai/provider.js';
import { createSeed } from '../src/domain.js';
import { askGrowthQuestion, applyGrowth } from '../src/core/growth.js';
import { plant } from '../src/core/seed-manager.js';
import { SeedStore } from '../src/storage/store.js';
import { addCodexOriginator, getOpenAIToken } from '../src/ai/openai-oauth.js';

describe('AI language handling', () => {
  it('adds the Codex originator to the OAuth authorize URL', () => {
    const url = addCodexOriginator('https://auth.openai.com/oauth/authorize?client_id=test');
    expect(new URL(url).searchParams.get('originator')).toBe('codex_cli_rs');
  });

  it('returns Korean local fallback suggestions when Korean is selected', async () => {
    const provider = new LocalProvider('ko');
    const result = JSON.parse(await provider.ask('GROW_QUESTION\nproblem: \nusers: \nopenQuestions: ')) as { question: string };
    expect(result.question).toContain('아이디어');
  });

  it('returns the structured grow update contract in local mode', async () => {
    const provider = new LocalProvider('ko');
    const result = JSON.parse(await provider.ask('GROW_UPDATE\ncoreIdea: 공부앱\nlatestAnswer: 학생이 매일 계획을 지켜요')) as {
      updatedSummary: string; questionReason: string; contradictionsDetected: string[]; suggestions: string[]; maturityDelta: number;
    };
    expect(result.updatedSummary).toContain('학생이 매일 계획을 지켜요');
    expect(result.questionReason).toContain('반영');
    expect(result.contradictionsDetected).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.maturityDelta).toBeGreaterThanOrEqual(1);
  });

  it('evaluates all maturity dimensions without an API key in local mode', async () => {
    const result = await evaluateMaturity(createSeed('A small study app'), 'local', undefined, 'en');
    expect(result.dimensions).toHaveLength(8);
    expect(result.clear).toEqual(expect.any(Array));
    expect(result.uncertain).toEqual(expect.any(Array));
    expect(result.explore).toEqual(expect.any(Array));
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

  it('reads the local Codex auth file used by openai-oauth', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-auth-'));
    const authFile = path.join(root, 'auth.json');
    const previous = process.env.SEED_OPENAI_AUTH_FILE;
    await writeFile(authFile, JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'oauth-token', account_id: 'account-1' } }));
    process.env.SEED_OPENAI_AUTH_FILE = authFile;
    try {
      expect(await getOpenAIToken()).toBe('oauth-token');
    } finally {
      if (previous === undefined) delete process.env.SEED_OPENAI_AUTH_FILE;
      else process.env.SEED_OPENAI_AUTH_FILE = previous;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('understands answers to Korean user/problem questions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-ko-'));
    try {
      const store = new SeedStore(root);
      const seed = await plant(store, '개발자를 돕는 안내 도구');
      const question = await askGrowthQuestion(store, seed, 'local', undefined, undefined, 'ko');
      const prompted = await store.load();
      expect(question).toContain('아이디어');
      const userAnswer = '처음에는 저장소를 처음 보는 개발자입니다.';
      const userResult = await applyGrowth(store, prompted, userAnswer, 'local', undefined, 'ko');
      expect(userResult.seed.users).toContain(userAnswer);
      expect(userResult.seed.problem).toBe('');
      const problemQuestion = await askGrowthQuestion(store, userResult.seed, 'local', undefined, undefined, 'ko');
      expect(problemQuestion).toContain('답답');
      const problemAnswer = '저장소 구조를 처음 파악할 때 가장 힘들어합니다.';
      const result = await applyGrowth(store, await store.load(), problemAnswer, 'local', undefined, 'ko');
      expect(result.seed.problem).toBe(problemAnswer);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
