import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_OPENAI_MODEL, OpenAICompatibleProvider, classifyGrowthInput, evaluateMaturity, getProvider, growthUpdate, inferProviderLanguage, nextQuestion, providerKey, testProviderConnection, waterInsight } from '../src/ai/provider.js';
import { detectGrowthInputIntent } from '../src/ai/input-intent.js';
import { createSeed } from '../src/domain.js';
import { askGrowthQuestion, applyGrowth } from '../src/core/growth.js';
import { plant } from '../src/core/seed-manager.js';
import { SeedStore, loadConfig, saveConfig } from '../src/storage/store.js';
import { addCodexOriginator, getOpenAIToken } from '../src/ai/openai-oauth.js';
import { buildContext } from '../src/ai/context-builder.js';

describe('AI language handling', () => {
  /**
   * Run an assertion with a configured OpenAI provider and a scripted fetch
   * response. Replaces the old local-provider test harness now that Seed
   * requires a real connected AI provider for every AI-backed call.
   */
  async function withMockedOpenAI<T>(responseContent: string, run: () => Promise<T>): Promise<T> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-mock-openai-'));
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


  it('keeps the requested OpenAI default model', () => {
    expect(DEFAULT_OPENAI_MODEL).toBe('gpt-5.6-luna');
  });

  it('lets a configured provider classify an ambiguous help request', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-input-intent-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
      expect(body.messages?.[1]?.content).toContain('GROW_INPUT_CLASSIFY');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"intent":"change-question"}' } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      await expect(classifyGrowthInput('잘 모르겠는데 어떻게 답해야 해?', '무엇을 만들까요?', 'openai', undefined, 'ko')).resolves.toBe('change-question');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not let a configured model override an obvious help safety signal', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-input-intent-safety-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"intent":"answer"}' } }] }), { status: 200 })) as typeof fetch;
    try {
      await expect(classifyGrowthInput('너무 어려워 다른질문', '어떤 결과를 원하나요?', 'openai', undefined, 'ko')).resolves.toBe('change-question');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps short yes/no replies as answers even when a model mislabels them', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-input-intent-ack-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"intent":"change-question"}' } }] }), { status: 200 })) as typeof fetch;
    try {
      await expect(classifyGrowthInput('응', '이 아이디어를 써볼까요?', 'openai', undefined, 'ko')).resolves.toBe('answer');
      await expect(classifyGrowthInput('yes', 'Would you try it?', 'openai', undefined, 'en')).resolves.toBe('answer');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps obvious offline-safety-net replies out of the idea summary', () => {
    expect(detectGrowthInputIntent('음...')).toBe('change-question');
    expect(detectGrowthInputIntent('전 이 질문에 어떻게 답해야 할지 모르겠어요')).toBe('change-question');
    expect(detectGrowthInputIntent('어렵다')).toBe('change-question');
    expect(detectGrowthInputIntent('도와주세요')).toBe('change-question');
    expect(detectGrowthInputIntent('잠깐 생각해볼게요')).toBe('pause');
    expect(detectGrowthInputIntent('다음에 생각해볼게요')).toBe('pause');
    expect(detectGrowthInputIntent('학생이 매일 단어를 복습해요')).toBe('answer');
  });

  it('recognizes natural beginner meta replies beyond fixed examples', () => {
    const cases = [
      '너무 어려워 다른질문',
      '어려워요, 다른 질문으로 해줘',
      '난 잘 모르겠어 다른 질문으로 해줘',
      '뭐라고 해야 할지 모르겠어요',
      '무슨 질문인지 모르겠어',
      'AI가 알아서 판단해줘',
      '나는 이런 질문이 아직 어려워',
      '나는 잘 모르겠어',
      '아 몰라',
      '이런 건 말고 다른 걸 물어봐줘',
      '네가 알아서 정해줘',
      '너가 골라줘',
      '아무거나 해줘',
      '예시로 쉽게 설명해줘',
      '개발을 잘 몰라서요',
      '이건 좀 개발자 같아',
      '다음 질문으로 넘어가줘',
      '아무 생각이 안 나요',
      '무슨 말인지 모르겠는데 다른 걸 물어봐',
      '이 질문이 무슨 뜻인지 모르겠는데요',
      '아무 생각이 안 나서요',
      '뭘 답해야 할지 모르겠는데요',
      '이거 어려워',
      '이 질문은 너무 어려워요',
      '저는 이거 너무 어려워요',
      '이건 너무 어려운 질문 같아요. 다른 질문으로 바꿔주세요',
      '질문 너무 어려워서 다른거',
      '무엇을 물어보는지 모르겠어요',
      '그냥 넘어가자',
      '이건 답을 못하겠어요',
      '이 질문이 부담스러워요',
      '너무 어려워 이런 것도 AI가 다 판단하게',
      'I am not sure what to say here',
      'Please let the AI decide',
      'This is overwhelming',
      'This is hard',
      'This question feels too abstract for me',
      'I do not know what to answer',
      'This is hard for me',
      "I'm stuck",
      'This is hard, let the AI decide',
      'Please ask something easier',
      'Too hard, ask another question',
      '그냥 넘어갈게요',
      '다른 질문 부탁해',
      '질문을 건너뛸게요',
      'Can we skip this question?',
      "I'm not sure what you're asking",
    ];
    for (const value of cases) expect(detectGrowthInputIntent(value)).toBe('change-question');
    expect(detectGrowthInputIntent('일단 나중에 답할게')).toBe('pause');
    expect(detectGrowthInputIntent('지금은 말고 나중에')).toBe('pause');
    expect(detectGrowthInputIntent("I'll think about it")).toBe('pause');
    expect(detectGrowthInputIntent('잠시 후에 답할게')).toBe('pause');
    expect(detectGrowthInputIntent('생각 좀 해볼게요')).toBe('pause');
    expect(detectGrowthInputIntent('답변을 생각해볼게요')).toBe('pause');
    expect(detectGrowthInputIntent('give me a second')).toBe('pause');
    expect(detectGrowthInputIntent('I need to think about this')).toBe('pause');
    expect(detectGrowthInputIntent('나는 학생들이 공부를 어려워하는 걸 돕고 싶어')).toBe('answer');
    expect(detectGrowthInputIntent('학생들이 질문을 어려워한다')).toBe('answer');
    expect(detectGrowthInputIntent('이 앱은 다른 질문을 제공한다')).toBe('answer');
    expect(detectGrowthInputIntent('AI가 어려운 질문을 판단하는 앱')).toBe('answer');
    expect(detectGrowthInputIntent('사용자가 어려워하는 질문을 다른 질문으로 제공하는 앱')).toBe('answer');
    expect(detectGrowthInputIntent('앱이 어려운 질문을 쉽게 바꿔준다')).toBe('answer');
    expect(detectGrowthInputIntent('이 앱은 학생들이 어려운 질문을 쉽게 이해하게 해')).toBe('answer');
    expect(detectGrowthInputIntent('학생들이 이 질문을 어려워해')).toBe('answer');
    expect(detectGrowthInputIntent('질문을 어려워하는 학생을 돕고 싶어')).toBe('answer');
    expect(detectGrowthInputIntent('The app provides an easier question')).toBe('answer');
    expect(detectGrowthInputIntent('Students find this question hard')).toBe('answer');
  });

  it('fails clearly instead of silently using an offline safety net when the classifier is unreachable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-input-intent-offline-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => { throw new Error('offline'); }) as typeof fetch;
    try {
      await expect(classifyGrowthInput('I am not sure what you want from me', 'What should we build?', 'openai', undefined, 'en')).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts a plain-text intent label from a configured provider', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-input-intent-label-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'change-question' } }] }), { status: 200 })) as typeof fetch;
    try {
      await expect(classifyGrowthInput('This is confusing.', 'Who is it for?', 'openai', undefined, 'en')).resolves.toBe('change-question');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('falls back to local intent detection when the model response is malformed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-input-intent-malformed-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'I cannot decide what you mean yet.' } }] }), { status: 200 })) as typeof fetch;
    try {
      await expect(classifyGrowthInput('예시로 쉽게 설명해줘', '무엇을 만들까요?', 'openai', undefined, 'ko')).resolves.toBe('change-question');
      await expect(classifyGrowthInput('students need shorter study sessions', '무엇을 만들까요?', 'openai', undefined, 'en')).resolves.toBe('answer');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects an unknown explicit provider instead of silently using local fallback', async () => {
    await expect(getProvider('does-not-exist', undefined, 'en')).rejects.toThrow('provider-not-configured:does-not-exist');
  });

  it('reports missing credentials for an explicit non-local provider', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-provider-missing-'));
    const previousHome = process.env.SEED_HOME;
    const previousOpenAI = process.env.SEED_OPENAI_API_KEY;
    const previousOpenAIStandard = process.env.OPENAI_API_KEY;
    process.env.SEED_HOME = root;
    delete process.env.SEED_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    try {
      await expect(getProvider('openai', undefined, 'en')).rejects.toThrow('provider-credential-missing');
    } finally {
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousOpenAI === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousOpenAI;
      if (previousOpenAIStandard === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousOpenAIStandard;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('strips legacy API keys and OAuth tokens from config persistence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-config-redact-'));
    const previousHome = process.env.SEED_HOME;
    process.env.SEED_HOME = root;
    const configPath = path.join(root, 'config.json');
    await writeFile(configPath, JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true, apiKey: 'do-not-persist', oauthTokens: { accessToken: 'do-not-persist' } }] }));
    try {
      const loaded = await loadConfig();
      const provider = loaded.providers.find((entry) => entry.id === 'openai') as Record<string, unknown> | undefined;
      expect(provider).toBeDefined();
      expect(provider).not.toHaveProperty('apiKey');
      expect(provider).not.toHaveProperty('oauthTokens');
      await saveConfig(loaded);
      const persisted = await (await import('node:fs/promises')).readFile(configPath, 'utf8');
      expect(persisted).not.toContain('do-not-persist');
    } finally {
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('discards malformed config entries and leaves the provider unset', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-config-invalid-'));
    const previousHome = process.env.SEED_HOME;
    process.env.SEED_HOME = root;
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 'old', lang: 'fr', activeProvider: 'missing', providers: [null, { id: 'broken', type: 'unknown' }] }));
    try {
      const config = await loadConfig();
      expect(config.activeProvider).toBe('');
      expect(config.lang).toBeUndefined();
      expect(config.providers).toEqual([]);
    } finally {
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('migrates the legacy OAuth model to the current default', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-config-model-migration-'));
    const previousHome = process.env.SEED_HOME;
    process.env.SEED_HOME = root;
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI account', type: 'openai', connectionMode: 'oauth', defaultModel: 'gpt-5.3-codex', enabled: true }] }));
    try {
      const config = await loadConfig();
      expect(config.providers.find((provider) => provider.id === 'openai')?.defaultModel).toBe('gpt-5.6-luna');
    } finally {
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails clearly instead of silently falling back when a configured provider is offline', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-provider-offline-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => { throw new Error('offline'); }) as typeof fetch;
    try {
      const seed = createSeed('A study app');
      await expect(nextQuestion(seed, undefined, undefined, 'en')).rejects.toThrow();
      await expect(growthUpdate(seed, 'Students need a shorter study session.', undefined, undefined, 'en')).rejects.toThrow();
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces an overlong or jargon-heavy question with a short safe one', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-length-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"백엔드 API와 배포 전략을 어떻게 검증할 가정으로 설계하시겠어요?","maturityDelta":3,"focus":"problem"}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('암기 앱');
      const seed = { ...base, users: ['매일 영어 단어를 외우지만 시간이 부족하고 무엇부터 해야 할지 몰라 여러 앱을 돌아다니는 학생 사용자'], openQuestions: [] };
      const result = await nextQuestion(seed, 'openai', undefined, 'ko');
      expect(result.question.length).toBeLessThan(80);
      expect(result.question).not.toMatch(/가정|검증|API|백엔드|배포/);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not silently switch OAuth configuration to an API key', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-provider-oauth-mode-'));
    const previousHome = process.env.SEED_HOME;
    const previousAuth = process.env.SEED_OPENAI_AUTH_FILE;
    const previousKey = process.env.OPENAI_API_KEY;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_AUTH_FILE = path.join(root, 'missing-auth.json');
    process.env.OPENAI_API_KEY = 'unrelated-api-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI account', type: 'openai', connectionMode: 'oauth', defaultModel: 'gpt-5.6-luna', enabled: true }] }));
    try {
      await expect(getProvider('openai', undefined, 'en')).rejects.toThrow('provider-credential-missing');
    } finally {
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousAuth === undefined) delete process.env.SEED_OPENAI_AUTH_FILE; else process.env.SEED_OPENAI_AUTH_FILE = previousAuth;
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resolves namespaced credentials for custom providers', () => {
    const previous = process.env.SEED_OPENROUTER_1_API_KEY;
    process.env.SEED_OPENROUTER_1_API_KEY = 'custom-key';
    try {
      expect(providerKey({ id: 'openrouter-1', name: 'OpenRouter', type: 'custom', defaultModel: 'model', enabled: true })).toBe('custom-key');
    } finally {
      if (previous === undefined) delete process.env.SEED_OPENROUTER_1_API_KEY;
      else process.env.SEED_OPENROUTER_1_API_KEY = previous;
    }
  });

  it('adds the Codex originator to the OAuth authorize URL', () => {
    const url = addCodexOriginator('https://auth.openai.com/oauth/authorize?client_id=test');
    expect(new URL(url).searchParams.get('originator')).toBe('codex_cli_rs');
  });

  it('flags only explicit exclusive-scope contradictions detected locally on top of a provider response', async () => {
    const seed = { ...createSeed('A study app'), constraints: ['웹만 지원'] };
    const responseFor = (summary: string): string => JSON.stringify({ updatedSummary: summary, questionReason: '반영했습니다', contradictionsDetected: [], suggestions: [], maturityDelta: 3 });
    const conflict = await withMockedOpenAI(responseFor('모바일 앱도 필요해요'), () => growthUpdate(seed, '모바일 앱도 필요해요', 'openai', undefined, 'ko'));
    expect(conflict.contradictionsDetected[0]).toContain('웹 전용');
    const compatible = await withMockedOpenAI(responseFor('웹에서 빠르게 확인해요'), () => growthUpdate(seed, '웹에서 빠르게 확인해요', 'openai', undefined, 'ko'));
    expect(compatible.contradictionsDetected).toEqual([]);
  });

  it('evaluates all maturity dimensions from a provider response', async () => {
    const dims = ['problem', 'user', 'core value', 'differentiation', 'scope', 'feasibility', 'motivation', 'confidence'].map((name) => ({ name, score: 40, reason: 'evidence' }));
    const response = JSON.stringify({ dimensions: dims, clear: [], uncertain: dims.map((d) => d.name), explore: ['What matters most?'] });
    const result = await withMockedOpenAI(response, () => evaluateMaturity(createSeed('A small study app'), 'openai', undefined, 'en'));
    expect(result.dimensions).toHaveLength(8);
    expect(result.clear).toEqual(expect.any(Array));
    expect(result.uncertain).toEqual(expect.any(Array));
    expect(result.explore).toEqual(expect.any(Array));
  });

  it('uses a Korean-language reason from the provider response', async () => {
    const dims = ['problem', 'user', 'core value', 'differentiation', 'scope', 'feasibility', 'motivation', 'confidence'].map((name) => ({ name, score: 70, reason: '현재 Seed 상태에서 근거가 확인됩니다.' }));
    const response = JSON.stringify({ dimensions: dims, clear: [], uncertain: [], explore: [] });
    const result = await withMockedOpenAI(response, () => evaluateMaturity({ ...createSeed('공부 앱'), problem: '집중하기 어렵다' }, 'openai', undefined, 'ko'));
    expect(result.dimensions[0]?.reason).toContain('현재 Seed');
    expect(result.dimensions[0]?.reason).not.toContain('Supported');
  });

  it('follows a Korean idea language even when the UI default is English', async () => {
    const seed = createSeed('공부앱');
    // The provider is asked for the "user" focus (the only missing field); a
    // wrong focus in the mocked response exercises the deterministic
    // Korean-language safe-question path instead of trusting the model text.
    const wrongFocusResponse = JSON.stringify({ question: 'irrelevant', maturityDelta: 3, focus: 'problem' });
    const question = await withMockedOpenAI(wrongFocusResponse, () => nextQuestion(seed, 'openai', undefined, 'en'));
    expect(question.question).toContain('아이디어');
    const updateResponse = JSON.stringify({ updatedSummary: '공부앱 — 학생이 매일 복습해요', questionReason: '방금 답변을 반영했습니다', contradictionsDetected: [], suggestions: [], maturityDelta: 3 });
    const update = await withMockedOpenAI(updateResponse, () => growthUpdate(seed, '학생이 매일 복습해요', 'openai', undefined, 'en'));
    expect(update.questionReason).toContain('반영');
  });

  it('keeps AI content in English when a Korean UI user writes an English idea', async () => {
    const seed = createSeed('A study app');
    const wrongFocusResponse = JSON.stringify({ question: 'irrelevant', maturityDelta: 3, focus: 'problem' });
    const question = await withMockedOpenAI(wrongFocusResponse, () => nextQuestion(seed, 'openai', undefined, 'ko'));
    expect(question.question).toContain('Who');
  });

  it('infers the Korean content language from a Korean seed regardless of the UI default', () => {
    expect(inferProviderLanguage('en', ['공부앱', '학생이 매일 복습해요'])).toBe('ko');
  });

  it('recognizes a short Korean idea instead of requiring a long phrase', async () => {
    const wrongFocusResponse = JSON.stringify({ question: 'irrelevant', maturityDelta: 3, focus: 'problem' });
    const question = await withMockedOpenAI(wrongFocusResponse, () => nextQuestion(createSeed('앱'), 'openai', undefined, 'en'));
    expect(question.question).toContain('아이디어');
  });

  it('keeps growth questions easy for non-developers when a provider returns jargon', async () => {
    const seed = { ...createSeed('공부앱'), users: ['학생'], problem: '단어를 오래 기억하지 못함', goals: ['단어를 기억하기'], constraints: ['암기만'], assumptions: ['학생이 매일 써봄'] };
    const response = JSON.stringify({ question: '이 가정을 어떻게 검증할 전략과 시그널을 정하시겠어요?', maturityDelta: 3, focus: 'validation' });
    const question = await withMockedOpenAI(response, () => nextQuestion(seed, 'openai', undefined, 'ko'));
    expect(question.question).not.toMatch(/가정|검증|시그널|신호|스코프|실현 가능성/);
  });

  it('keeps a long conversation moving with an unused safe question after the safe pool is used', async () => {
    const base = createSeed('공부앱');
    const previous = [
      '이 아이디어를 가장 먼저 써봤으면 하는 사람은 누구예요?',
      '처음 도움을 받고 싶은 사람을 한 명만 떠올리면 누구예요?',
      '이 아이디어가 꼭 필요한 사람은 어떤 사람인가요?',
      '처음 이 아이디어를 써볼 사람은 누구예요?',
      '가장 먼저 떠오르는 사용자는 누구예요?',
      '누가 이 아이디어를 가장 반가워할까요?',
      '오늘 이걸 써볼 사람은 누구일까요?',
    ].map((question, index) => ({ id: `old-${index}`, seedId: base.id, question, focus: 'user' as const, importance: 'high' as const, status: 'answered' as const, answer: '이전 답변', createdAt: new Date(index).toISOString() }));
    // A wrong-focus response forces the deterministic safe-question path so
    // this exercises `unusedSafeQuestion` without depending on the removed
    // local provider class.
    const wrongFocusResponse = JSON.stringify({ question: 'irrelevant', maturityDelta: 3, focus: 'problem' });
    const result = await withMockedOpenAI(wrongFocusResponse, () => nextQuestion({ ...base, openQuestions: previous }, 'openai', undefined, 'ko'));
    expect(result.question).toBe('지금 떠오르는 한 가지를 말해볼까요?');
    expect(previous.some((entry) => entry.question === result.question)).toBe(false);
  });

  it('keeps branch follow-up questions free of developer jargon', async () => {
    const seed = createSeed('A study app');
    const branch = { id: 'branch-1', seedId: seed.id, name: 'Focused workflow', slug: 'focused-workflow', summary: 'A focused workflow', direction: 'Focused workflow', status: 'active' as const, maturity: 20, assumptions: [], decisions: [], openQuestions: [], createdAt: '', updatedAt: '' };
    const response = JSON.stringify({ question: 'What is the signal that validates this assumption within scope?', maturityDelta: 3, focus: 'validation' });
    const question = await withMockedOpenAI(response, () => nextQuestion(seed, 'openai', undefined, 'en', [], branch));
    expect(question.question).not.toMatch(/signal|scope|validation|assumption/i);
  });

  it('follows the latest Korean answer when an idea started in English', async () => {
    const seed = createSeed('A study app');
    const wrongFocusResponse = JSON.stringify({ question: 'irrelevant', maturityDelta: 3, focus: 'problem' });
    const question = await withMockedOpenAI(wrongFocusResponse, () => nextQuestion(seed, 'openai', undefined, 'en', [{
      id: 'answer-1', seedId: seed.id, role: 'user', type: 'answer', content: '학생이 먼저 써요.', createdAt: '',
    }]));
    expect(question.question).toContain('아이디어');
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

  it('preserves chat roles for OpenAI-compatible providers', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(body.messages[1]?.content).toBe('I want a study app.');
      expect(body.messages[2]?.content).toBe('Who should it help first?');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Let us narrow the first user.' } }] }), { status: 200 });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const provider = new OpenAICompatibleProvider({ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'gpt-test', enabled: true }, 'test-key', 'en');
      await expect(provider.chat([
        { role: 'user', content: 'I want a study app.' },
        { role: 'assistant', content: 'Who should it help first?' },
        { role: 'user', content: 'High-school students.' },
      ])).resolves.toBe('Let us narrow the first user.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses role-separated history when generating the next growth question', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-grow-chat-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      expect(body.messages.map((message) => message.role)).toEqual(['system', 'system', 'assistant', 'user']);
      expect(body.messages[2]?.content).toBe('A previous reflection.');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"What should we explore first?","focus":"user","maturityDelta":3}' } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const seed = createSeed('A study app');
      const result = await nextQuestion(seed, 'openai', undefined, 'en', [{ id: 'history-1', seedId: seed.id, role: 'assistant', type: 'summary', content: 'A previous reflection.', createdAt: '' }]);
      expect(result.question).toBe('What should we explore first?');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps chat roles to Gemini and Anthropic envelopes', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      if (url.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini reply' }] } }] }), { status: 200 });
      return new Response(JSON.stringify({ content: [{ text: 'anthropic reply' }] }), { status: 200 });
    }) as typeof fetch;
    const messages = [
      { role: 'system' as const, content: 'Keep it focused.' },
      { role: 'user' as const, content: 'The idea.' },
      { role: 'assistant' as const, content: 'The reflection.' },
    ];
    try {
      const gemini = new OpenAICompatibleProvider({ id: 'gemini', name: 'Gemini', type: 'gemini', defaultModel: 'gemini-test', enabled: true }, 'test-key', 'en');
      const anthropic = new OpenAICompatibleProvider({ id: 'anthropic', name: 'Anthropic', type: 'anthropic', defaultModel: 'claude-test', enabled: true }, 'test-key', 'en');
      await expect(gemini.chat(messages)).resolves.toBe('gemini reply');
      await expect(anthropic.chat(messages)).resolves.toBe('anthropic reply');
      const geminiBody = calls[0]?.body as { contents: Array<{ role: string }>; systemInstruction: { parts: Array<{ text: string }> } };
      expect(geminiBody.contents.map((entry) => entry.role)).toEqual(['user', 'model']);
      expect(geminiBody.systemInstruction.parts[0]?.text).toContain('Keep it focused.');
      const anthropicBody = calls[1]?.body as { messages: Array<{ role: string }>; system: string };
      expect(anthropicBody.messages.map((entry) => entry.role)).toEqual(['user', 'assistant']);
      expect(anthropicBody.system).toContain('Keep it focused.');

      await expect(gemini.chat([
        { role: 'assistant', content: 'A previous question.' },
        { role: 'assistant', content: 'A short reflection.' },
        { role: 'user', content: 'The answer.' },
      ])).resolves.toBe('gemini reply');
      await expect(anthropic.chat([
        { role: 'assistant', content: 'A previous question.' },
        { role: 'assistant', content: 'A short reflection.' },
        { role: 'user', content: 'The answer.' },
      ])).resolves.toBe('anthropic reply');
      const normalizedGemini = calls[2]?.body as { contents: Array<{ role: string; parts: Array<{ text: string }> }> };
      expect(normalizedGemini.contents.map((entry) => entry.role)).toEqual(['user', 'model', 'user']);
      expect(normalizedGemini.contents[1]?.parts[0]?.text).toContain('A previous question.');
      const normalizedAnthropic = calls[3]?.body as { messages: Array<{ role: string; content: string }> };
      expect(normalizedAnthropic.messages.map((entry) => entry.role)).toEqual(['user', 'assistant', 'user']);
      expect(normalizedAnthropic.messages[1]?.content).toContain('A short reflection.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('requires a real response when testing a provider connection', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 })) as typeof fetch;
    try {
      await expect(testProviderConnection({ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'gpt-test', enabled: true }, 'en', 'test-key')).resolves.toBeUndefined();
    } finally { globalThis.fetch = originalFetch; }
  });

  it('rejects an empty provider response during configuration testing', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 })) as typeof fetch;
    try {
      await expect(testProviderConnection({ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'gpt-test', enabled: true }, 'en', 'test-key')).rejects.toThrow('provider-empty-response');
    } finally { globalThis.fetch = originalFetch; }
  });

  it('normalizes provider maturity dimension names and preserves all eight scores', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-maturity-provider-'));
    const previousHome = process.env.SEED_HOME; const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const names = ['PROBLEM', 'USER', 'CORE_VALUE', 'DIFFERENTIATION', 'SCOPE', 'FEASIBILITY', 'MOTIVATION', 'CONFIDENCE'];
    process.env.SEED_HOME = root; process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
      expect(body.messages?.[1]?.content).toContain('sunlightResearch: Users: Students already use flashcards.');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ dimensions: names.map((name, index) => ({ name, score: 60 + index, reason: 'Define the MVP roadmap.' })), clear: ['CORE_VALUE'], uncertain: ['DIFFERENTIATION'], explore: ['Define the MVP roadmap.', 'CONFIDENCE'] }) } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const result = await evaluateMaturity(createSeed('A study idea'), 'openai', undefined, 'en', [{ id: 'research-1', seedId: 'seed', source: 'user', title: 'Users', summary: 'Students already use flashcards.', relevance: 'high', retrievedAt: '', isVerified: false, isEstimate: true }]);
      expect(result.dimensions).toHaveLength(8);
      expect(result.dimensions.map((dimension) => dimension.score)).toEqual([60, 61, 62, 63, 64, 65, 66, 67]);
      expect(result.clear).toEqual(['core value']);
      expect(result.uncertain).toEqual(['differentiation']);
      expect(result.explore).toEqual(['confidence']);
      expect(result.dimensions.every((dimension) => !dimension.reason.includes('MVP'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces a repeated provider question with an unused conversational prompt', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-dedupe-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const repeated = 'What signal would tell you this idea genuinely helped?';
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ question: repeated, focus: 'validation', maturityDelta: 3 }) } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('A study app');
      const seed = { ...base, users: ['students'], problem: 'focus', goals: ['finish'], constraints: ['timer'], assumptions: ['students return'], openQuestions: [{ id: 'answered', seedId: base.id, question: repeated, importance: 'medium' as const, status: 'answered' as const, answer: 'yes', createdAt: '' }] };
      const result = await nextQuestion(seed, 'openai', undefined, 'en');
      expect(result.question).not.toBe(repeated);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not repeat a question that fell outside the bounded prompt context', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-old-dedupe-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    const repeated = 'What would show that this idea really helped?';
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ question: repeated, focus: 'validation', maturityDelta: 3 }) } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('A study idea');
      const openQuestions = Array.from({ length: 13 }, (_, index) => ({
        id: `q-${index}`, seedId: base.id, question: index === 0 ? repeated : `Old question ${index}`,
        focus: 'validation' as const, importance: 'medium' as const, status: 'answered' as const, answer: 'noted', createdAt: `${String(index + 1).padStart(2, '0')}`,
      }));
      const result = await nextQuestion({ ...base, users: ['students'], problem: 'focus', goals: ['finish'], constraints: ['timer'], assumptions: ['students return'], openQuestions }, 'openai', undefined, 'en');
      expect(result.question).not.toBe(repeated);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces provider jargon with a beginner-friendly question', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-jargon-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"첫 검증에서 가장 위험한 가정은 무엇일까요?","focus":"validation","maturityDelta":3}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('암기 앱');
      const seed = { ...base, users: ['학생'], problem: '단어를 잘 기억하지 못함', goals: ['단어를 기억하기'], constraints: ['암기만'], assumptions: ['학생이 매일 써본다'], openQuestions: [] };
      const result = await nextQuestion(seed, 'openai', undefined, 'ko');
      expect(result.question).not.toContain('타깃');
      expect(result.question).not.toContain('검증');
      expect(result.question).not.toContain('가정');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('filters technical feasibility wording from beginner questions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-technical-jargon-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"기술적으로 가능한가요?","focus":"validation","maturityDelta":3}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('암기 앱');
      const seed = { ...base, users: ['학생'], problem: '단어를 잘 기억하지 못함', goals: ['단어를 기억하기'], constraints: ['암기만'], assumptions: ['학생이 매일 써본다'], openQuestions: [] };
      const result = await nextQuestion(seed, 'openai', undefined, 'ko');
      expect(result.question).not.toContain('기술적');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('filters common software terms from beginner questions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-software-jargon-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"이 기능의 API와 백엔드를 어떻게 배포할까요?","focus":"validation","maturityDelta":3}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('암기 앱');
      const seed = { ...base, users: ['학생'], problem: '단어를 잘 기억하지 못함', goals: ['단어를 기억하기'], constraints: ['암기만'], assumptions: ['학생이 매일 써본다'], openQuestions: [] };
      const result = await nextQuestion(seed, 'openai', undefined, 'ko');
      expect(result.question).not.toMatch(/API|백엔드|배포/);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces short but abstract provider questions with a concrete one', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-abstract-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"What broader impact should this idea have?","focus":"user","maturityDelta":3}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const result = await nextQuestion(createSeed('A study app'), 'openai', undefined, 'en');
      expect(result.question).not.toContain('impact');
      expect(result.question).toContain('Who');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces broad strategy questions with a concrete one', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-broad-abstract-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    const generated = [
      '장기적으로 어떤 방향으로 발전시키고 싶나요?',
      'What makes this idea worth building?',
    ];
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ question: generated.shift(), focus: 'validation', maturityDelta: 3 }) } }] }), { status: 200 })) as typeof fetch;
    try {
      const koreanSeed = { ...createSeed('암기 앱'), users: ['학생'], problem: '단어를 잊음', goals: ['기억'], constraints: ['암기만'], assumptions: ['써본다'], openQuestions: [] };
      const korean = await nextQuestion(koreanSeed, 'openai', undefined, 'ko');
      expect(korean.question).not.toContain('장기적으로');
      expect(korean.question).toContain('사람');
      const englishSeed = { ...createSeed('A study app'), users: ['students'], problem: 'forgetting words', goals: ['remember more'], constraints: ['one small flow'], assumptions: ['students try it'], openQuestions: [] };
      const english = await nextQuestion(englishSeed, 'openai', undefined, 'en');
      expect(english.question).not.toContain('worth building');
      expect(english.question).toContain('come back');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps a safe required-focus question when the model chooses the wrong focus', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-focus-guard-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"첫 검증에서 가장 위험한 가정은 무엇일까요?","focus":"user","maturityDelta":3}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('암기 앱');
      const seed = { ...base, users: ['학생'], problem: '단어를 잘 기억하지 못함', goals: ['단어를 기억하기'], constraints: ['암기만'], assumptions: ['학생이 매일 써본다'], openQuestions: [] };
      const result = await nextQuestion(seed, 'openai', undefined, 'ko');
      expect(result.focus).toBe('validation');
      expect(result.question).not.toMatch(/검증|가정|기술적/);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('replaces an overlong provider question with a short one', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-length-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ question: '이 아이디어를 처음 써볼 사람과 그 사람이 겪는 문제와 원하는 결과와 지금 사용하는 방법을 한꺼번에 자세히 설명해 주실 수 있을까요?', focus: 'validation', maturityDelta: 3 }) } }] }), { status: 200 })) as typeof fetch;
    try {
      const base = createSeed('암기 앱');
      const seed = { ...base, users: ['학생'], problem: '단어를 잘 기억하지 못함', goals: ['단어를 기억하기'], constraints: ['암기만'], assumptions: ['학생이 매일 써본다'], openQuestions: [] };
      const result = await nextQuestion(seed, 'openai', undefined, 'ko');
      expect(result.question.length).toBeLessThan(80);
      expect(result.question).not.toContain('한꺼번에');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('asks the provider for a concrete question after a user requests an easier angle', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-question-simple-mode-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
      expect(body.messages?.some((message) => message.content?.includes('especially easy, concrete question'))).toBe(true);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"처음 써볼 사람은 누구예요?","focus":"validation","maturityDelta":3}' } }] }), { status: 200 });
    }) as typeof fetch;
    try {
      const base = createSeed('암기 앱');
      const seed = { ...base, users: ['학생'], problem: '단어를 잘 기억하지 못함', goals: ['단어를 기억하기'], constraints: ['암기만'], assumptions: ['학생이 매일 써본다'], openQuestions: [] };
      const result = await nextQuestion(seed, 'openai', undefined, 'ko', [], undefined, { preferSimpleQuestion: true });
      expect(result.question).toBe('처음 써볼 사람은 누구예요?');
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('does not expose provider jargon in growth guidance', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-growth-guidance-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ updatedSummary: 'An MVP roadmap for students.', questionReason: 'This improves validation confidence.', contradictionsDetected: ['Check the target audience scope.'], suggestions: ['Define the MVP roadmap.'], maturityDelta: 3 }) } }] }), { status: 200 })) as typeof fetch;
    try {
      const result = await growthUpdate(createSeed('A study app'), 'Students need a shorter study session.', 'openai', undefined, 'en');
      expect(result.updatedSummary).not.toContain('MVP');
      expect(result.updatedSummary).toContain('Students need a shorter study session.');
      expect(result.questionReason).toBe('I reflected your answer in the idea.');
      expect(result.suggestions).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('filters abstract guidance as well as developer jargon', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-growth-guidance-simple-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ updatedSummary: 'A study app for students.', questionReason: 'The answer gives us a clear next step.', contradictionsDetected: ['What broader impact should this idea have?'], suggestions: ['What would prove that the idea is worth continuing to build?'], maturityDelta: 3 }) } }] }), { status: 200 })) as typeof fetch;
    try {
      const result = await growthUpdate(createSeed('A study app'), 'Students want shorter study sessions.', 'openai', undefined, 'en');
      expect(result.questionReason).toBe('The answer gives us a clear next step.');
      expect(result.contradictionsDetected).toEqual([]);
      expect(result.suggestions).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps validation prompts concrete for beginners when a provider returns jargon', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'seed-validation-question-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = root;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(root, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"question":"이 아이디어의 위험한 가정을 어떻게 검증할 전략을 세우시겠어요?","maturityDelta":3,"focus":"validation"}' } }] }), { status: 200 })) as typeof fetch;
    try {
      const seed = { ...createSeed('암기 앱'), users: ['학생'], problem: '단어를 잊음', goals: ['단어 기억'], constraints: ['암기만'], assumptions: ['학생이 써봄'], openQuestions: [] };
      const question = await nextQuestion(seed, 'openai', undefined, 'ko');
      expect(question.question).not.toMatch(/가정|검증|위험한|가치가 있다고|가치를|영향|전략|기준/);
      expect(question.question).toMatch(/사람|무엇|언제|어떤/);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(root, { recursive: true, force: true });
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
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'seed-ko-'));
    const configHome = await mkdtemp(path.join(os.tmpdir(), 'seed-ko-home-'));
    const previousHome = process.env.SEED_HOME;
    const previousKey = process.env.SEED_OPENAI_API_KEY;
    const originalFetch = globalThis.fetch;
    process.env.SEED_HOME = configHome;
    process.env.SEED_OPENAI_API_KEY = 'test-key';
    await writeFile(path.join(configHome, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'OpenAI', type: 'openai', defaultModel: 'test-model', enabled: true }] }));
    let nextResponse = JSON.stringify({ question: '이 아이디어를 가장 먼저 써봤으면 하는 사람은 누구예요?', maturityDelta: 3, focus: 'user' });
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: nextResponse } }] }), { status: 200 })) as typeof fetch;
    try {
      const store = new SeedStore(projectRoot);
      const seed = await plant(store, '개발자를 돕는 안내 도구');
      const question = await askGrowthQuestion(store, seed, 'openai', undefined, undefined, 'ko');
      const prompted = await store.load();
      expect(question).toContain('아이디어');
      const userAnswer = '처음에는 저장소를 처음 보는 개발자입니다.';
      nextResponse = JSON.stringify({ updatedSummary: `개발자를 돕는 안내 도구 — ${userAnswer}`, questionReason: '반영했습니다', contradictionsDetected: [], suggestions: [], maturityDelta: 3 });
      const userResult = await applyGrowth(store, prompted, userAnswer, 'openai', undefined, 'ko');
      expect(userResult.seed.users).toContain(userAnswer);
      expect(userResult.seed.problem).toBe('');
      nextResponse = JSON.stringify({ question: '“처음에는 저장소를 처음 보는 개발자입니다”인 사람이 가장 답답하거나 막히는 순간은 언제예요?', maturityDelta: 3, focus: 'problem' });
      const problemQuestion = await askGrowthQuestion(store, userResult.seed, 'openai', undefined, undefined, 'ko');
      expect(problemQuestion).toContain('답답');
      expect(problemQuestion).toContain('처음에는');
      const problemAnswer = '저장소 구조를 처음 파악할 때 가장 힘들어합니다.';
      nextResponse = JSON.stringify({ updatedSummary: `개발자를 돕는 안내 도구 — ${problemAnswer}`, questionReason: '반영했습니다', contradictionsDetected: [], suggestions: [], maturityDelta: 3 });
      const result = await applyGrowth(store, await store.load(), problemAnswer, 'openai', undefined, 'ko');
      expect(result.seed.problem).toBe(problemAnswer);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = previousHome;
      if (previousKey === undefined) delete process.env.SEED_OPENAI_API_KEY; else process.env.SEED_OPENAI_API_KEY = previousKey;
      await rm(projectRoot, { recursive: true, force: true });
      await rm(configHome, { recursive: true, force: true });
    }
  });

  it('scopes AI context to the active branch', () => {
    const seed = createSeed('An idea');
    const branch = { id: 'branch-1', seedId: seed.id, name: 'One path', slug: 'one-path', summary: 'One path summary', direction: 'One path', status: 'active' as const, maturity: 20, assumptions: [], decisions: [{ id: 'branch-decision', seedId: seed.id, branchId: 'branch-1', decision: 'Use the focused path', reason: 'Smallest test', source: 'user', confirmedByUser: true, createdAt: '' }], openQuestions: [], createdAt: '', updatedAt: '' };
    const context = buildContext({ ...seed, openQuestions: [
      { id: 'root-q', seedId: seed.id, question: 'Root question', importance: 'medium', status: 'open', createdAt: '' },
      { id: 'branch-q', seedId: seed.id, branchId: branch.id, question: 'Branch question', importance: 'high', status: 'open', createdAt: '' },
    ] }, 'grow', [], branch, {
      relevantHistory: [{ id: 'event-1', seedId: seed.id, type: 'grow', message: 'Core idea became clearer.', createdAt: '' }],
      sunlightResearch: [{ id: 'research-1', seedId: seed.id, source: 'user', title: 'User note', summary: 'Students already use flashcards.', relevance: 'high', retrievedAt: '', isVerified: false, isEstimate: true }],
    });
    expect(context.coreIdea).toBe('One path summary');
    expect(context.openQuestions.map((question) => question.question)).toEqual(['Branch question', 'Root question']);
    expect(context.importantDecisions.map((decision) => decision.decision)).toEqual(['Use the focused path']);
    expect(context.relevantHistory?.[0]?.message).toContain('clearer');
    expect(context.sunlightResearch?.[0]?.title).toBe('User note');
    expect(context.branchContext?.decisions[0]?.decision).toBe('Use the focused path');
  });
});




