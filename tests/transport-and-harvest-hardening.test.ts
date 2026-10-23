import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, migrateLegacyOAuthModel } from '../src/storage/store.js';
import { OpenAICompatibleProvider, OpenAIOAuthProvider, providerTimeoutSignal } from '../src/ai/transport.js';
import { generateText } from 'ai';
import { createSeed, type HarvestType } from '../src/domain.js';
import { generateHarvestDocument, documentSections, type HarvestInput } from '../src/ai/harvest-document.js';
import type { ProviderMessage } from '../src/ai/contracts.js';

vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), generateText: vi.fn() }));

const originalFetch = globalThis.fetch;
const envKeys = ['SEED_HOME'];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.mocked(generateText).mockReset();
  for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
});

describe('legacy OAuth model migration (#32)', () => {
  it('maps the legacy default in one helper and leaves other models untouched', () => {
    expect(migrateLegacyOAuthModel('gpt-5.3-codex')).toBe('gpt-5.6-luna');
    expect(migrateLegacyOAuthModel('gpt-5.6-luna')).toBe('gpt-5.6-luna');
    expect(migrateLegacyOAuthModel('gpt-test')).toBe('gpt-test');
  });

  it('migrates a stored legacy OAuth model when the config is loaded', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'seed-migrate-'));
    try {
      process.env.SEED_HOME = home;
      await writeFile(path.join(home, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'openai', type: 'openai', connectionMode: 'oauth', defaultModel: 'gpt-5.3-codex', enabled: true }] }));
      const config = await loadConfig();
      expect(config.providers.find((provider) => provider.id === 'openai')?.defaultModel).toBe('gpt-5.6-luna');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe('Gemini API key transport (#34)', () => {
  it('sends the key in the x-goog-api-key header and never in the URL', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'gemini reply' }] } }] }), { status: 200 });
    }) as typeof fetch;
    const gemini = new OpenAICompatibleProvider({ id: 'gemini', name: 'Gemini', type: 'gemini', defaultModel: 'gemini-test', enabled: true }, 'secret-key-123', 'en');
    await expect(gemini.ask('hello')).resolves.toBe('gemini reply');
    await expect(gemini.chat([{ role: 'user', content: 'hi' }])).resolves.toBe('gemini reply');
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).not.toContain('key=');
      expect(call.url).not.toContain('secret-key-123');
      expect(new Headers(call.init?.headers).get('x-goog-api-key')).toBe('secret-key-123');
    }
  });
});

describe('OAuth provider timeout cancels the request (#35)', () => {
  it('creates a signal that aborts after the configured limit', async () => {
    process.env.SEED_AI_TIMEOUT_MS = '20';
    const signal = providerTimeoutSignal();
    expect(signal.aborted).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(signal.aborted).toBe(true);
  });

  it('aborts the SDK request on timeout and still reports the timeout message', async () => {
    process.env.SEED_AI_TIMEOUT_MS = '20';
    // Mimic the SDK: the call stays pending until its abort signal fires.
    vi.mocked(generateText).mockImplementation(((options: { abortSignal?: AbortSignal }) => new Promise((_resolve, reject) => {
      options.abortSignal?.addEventListener('abort', () => reject(options.abortSignal?.reason));
    })) as unknown as typeof generateText);
    const provider = new OpenAIOAuthProvider({ id: 'openai', name: 'openai', type: 'openai', connectionMode: 'oauth', defaultModel: 'gpt-test', enabled: true });
    await expect(provider.ask('Hello')).rejects.toThrow('openai request timed out after 20ms.');
    expect(vi.mocked(generateText).mock.calls[0]![0].abortSignal?.aborted).toBe(true);
  });
});

describe('harvest quote matching and retry (#36)', () => {
  const seed = createSeed('Users enter a task name and save the task to a list.');
  // Source uses curly quotes, a non-breaking space and repeated spaces; the model quotes it with straight quotes.
  const sourceText = 'Users enter “a task name” and save the task   to a list.';
  const input: HarvestInput = { evidence: [{ id: 'idea', text: sourceText }], excluded: [] };
  const type: HarvestType = 'prd';
  function draft(quote: string) {
    return { claims: [{ id: 'c1', section: 'flow', text: 'The user enters a task name and saves it.', evidence: [{ sourceId: 'idea', quote }] }],
      missing: documentSections[type].filter((entry) => entry.id !== 'flow').map((entry) => entry.id) };
  }
  function fakeProvider(document: (call: number) => string) {
    let documentCalls = 0;
    return { id: 'test', model: 'test-model', ask: vi.fn(), stream: vi.fn(), testConnection: vi.fn(), listModels: vi.fn(),
      chat: vi.fn(async (messages: ProviderMessage[]) => messages.at(-1)!.content.startsWith('HARVEST_DOCUMENT')
        ? document(documentCalls++) : JSON.stringify({ verdicts: [{ id: 'c1', supported: true }] })) };
  }
  const documentCalls = (fake: ReturnType<typeof fakeProvider>) => fake.chat.mock.calls.filter(([messages]) => messages.at(-1)!.content.startsWith('HARVEST_DOCUMENT')).length;

  it('accepts a quote that differs from the source only by whitespace and curly quotes', async () => {
    const fake = fakeProvider(() => JSON.stringify(draft('Users enter "a task name" and save the task to a list.')));
    await expect(generateHarvestDocument(seed, type, 'en', input, { provider: fake })).resolves.toContain('Source evidence');
  });

  it('accepts a decomposed (NFD) quote against a composed source', async () => {
    const composed = { evidence: [{ id: 'idea', text: 'Café users enter a task name.' }], excluded: [] };
    const fake = fakeProvider(() => JSON.stringify(draft('Café users enter a task name.')));
    await expect(generateHarvestDocument(seed, type, 'en', composed, { provider: fake })).resolves.toContain('Source evidence');
  });

  it('still rejects a quote whose words are not in the source', async () => {
    const fake = fakeProvider(() => JSON.stringify(draft('Users pay with Stripe')));
    await expect(generateHarvestDocument(seed, type, 'en', input, { provider: fake })).rejects.toThrow('harvest-unsupported-content');
  });

  it('retries the generation once when the first reply is invalid', async () => {
    const fake = fakeProvider((call) => (call === 0 ? 'not JSON' : JSON.stringify(draft('Users enter "a task name" and save the task to a list.'))));
    await expect(generateHarvestDocument(seed, type, 'en', input, { provider: fake })).resolves.toContain('Source evidence');
    expect(documentCalls(fake)).toBe(2);
  });

  it('fails after a single retry when the reply stays invalid', async () => {
    const fake = fakeProvider(() => 'not JSON');
    await expect(generateHarvestDocument(seed, type, 'en', input, { provider: fake })).rejects.toThrow('ai-response-invalid');
    expect(documentCalls(fake)).toBe(2);
  });
});
