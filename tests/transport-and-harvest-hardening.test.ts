import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, migrateLegacyOAuthModel } from '../src/storage/store.js';

const envKeys = ['SEED_HOME'];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
afterEach(() => {
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
