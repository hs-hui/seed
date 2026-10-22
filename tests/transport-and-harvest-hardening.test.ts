import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, migrateLegacyOAuthModel } from '../src/storage/store.js';
import { OpenAICompatibleProvider } from '../src/ai/transport.js';

const originalFetch = globalThis.fetch;
const envKeys = ['SEED_HOME'];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
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
