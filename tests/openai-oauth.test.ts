import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureOpenAIAuthFile, getOpenAIToken, loginOpenAI } from '../src/ai/openai-oauth.js';

const prompts = vi.hoisted(() => ({ confirm: vi.fn(async () => false) }));
const login = vi.hoisted(() => ({ run: vi.fn(async (): Promise<never> => { throw new Error('browser-login-stub'); }) }));

vi.mock('@inquirer/prompts', () => ({ confirm: prompts.confirm }));
vi.mock('openai-oauth', () => ({ runOpenAIOAuthLogin: login.run }));

const exists = async (filePath: string) => { try { await stat(filePath); return true; } catch { return false; } };

const codexAuth = {
  auth_mode: 'chatgpt',
  tokens: { access_token: 'codex-access-token', refresh_token: 'codex-refresh-token', account_id: 'account-1' },
  last_refresh: new Date().toISOString(),
};

describe('OpenAI account credentials', () => {
  let root: string;
  let codexFile: string;
  let seedFile: string;
  const saved = { home: process.env.HOME, seedHome: process.env.SEED_HOME, authFile: process.env.SEED_OPENAI_AUTH_FILE };
  const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

  const setTTY = (value: boolean) => Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-openai-oauth-'));
    // os.homedir() reads HOME on POSIX, so the Codex CLI path resolves inside the temp root.
    process.env.HOME = root;
    process.env.SEED_HOME = path.join(root, 'seed');
    delete process.env.SEED_OPENAI_AUTH_FILE;
    codexFile = path.join(root, '.codex', 'auth.json');
    seedFile = path.join(root, 'seed', 'oauth', 'openai.json');
    await mkdir(path.dirname(codexFile), { recursive: true });
    await writeFile(codexFile, JSON.stringify(codexAuth));
    prompts.confirm.mockReset();
    prompts.confirm.mockResolvedValue(false);
    login.run.mockClear();
    setTTY(false);
  });

  afterEach(async () => {
    if (ttyDescriptor) Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor); else delete (process.stdin as { isTTY?: boolean }).isTTY;
    if (saved.home === undefined) delete process.env.HOME; else process.env.HOME = saved.home;
    if (saved.seedHome === undefined) delete process.env.SEED_HOME; else process.env.SEED_HOME = saved.seedHome;
    if (saved.authFile === undefined) delete process.env.SEED_OPENAI_AUTH_FILE; else process.env.SEED_OPENAI_AUTH_FILE = saved.authFile;
    await rm(root, { recursive: true, force: true });
  });

  describe('Codex CLI credential import (#17)', () => {
    it('never copies ~/.codex/auth.json at request time', async () => {
      expect(await getOpenAIToken()).toBeUndefined();
      expect(await exists(seedFile)).toBe(false);
      expect(prompts.confirm).not.toHaveBeenCalled();
    });

    it('fails request-time provider setup with a message pointing to login', async () => {
      await expect(ensureOpenAIAuthFile()).rejects.toThrow(/openai-oauth-not-imported.*seed config login openai/);
      expect(await exists(seedFile)).toBe(false);
    });

    it('copies the Codex session only after the user consents at login time', async () => {
      setTTY(true);
      prompts.confirm.mockResolvedValue(true);
      const tokens = await loginOpenAI('en');
      expect(prompts.confirm).toHaveBeenCalledTimes(1);
      expect(String(prompts.confirm.mock.calls[0]?.[0]?.message)).toContain(codexFile);
      expect(login.run).not.toHaveBeenCalled();
      expect(tokens.access_token).toBe('codex-access-token');
      expect(JSON.parse(await readFile(seedFile, 'utf8')).tokens.access_token).toBe('codex-access-token');
    });

    it('does not copy when the user declines and continues with the browser login', async () => {
      setTTY(true);
      prompts.confirm.mockResolvedValue(false);
      await expect(loginOpenAI('en')).rejects.toThrow('browser-login-stub');
      expect(prompts.confirm).toHaveBeenCalledTimes(1);
      expect(login.run).toHaveBeenCalledWith(expect.objectContaining({ authFilePath: seedFile }));
      expect(await exists(seedFile)).toBe(false);
    });

    it('does not prompt or copy when stdin is not a TTY', async () => {
      await expect(loginOpenAI('en')).rejects.toThrow('browser-login-stub');
      expect(prompts.confirm).not.toHaveBeenCalled();
      expect(await exists(seedFile)).toBe(false);
    });
  });
});
