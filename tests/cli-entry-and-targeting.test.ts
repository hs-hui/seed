import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { SeedStore } from '../src/storage/store.js';
import { plant } from '../src/core/seed-manager.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxLoader = pathToFileURL(path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
const entry = path.join(repoRoot, 'src', 'cli', 'index.ts');
const entrySource = path.join(repoRoot, 'src', 'cli', 'index.ts');

function cliEnv(home: string, baseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('SEED_') || /API_KEY$/.test(key)) delete env[key];
  }
  return { ...env, SEED_HOME: home, SEED_LANG: 'en', SEED_OPENAI_AUTH_FILE: path.join(home, 'missing-auth.json'), SEED_OPENAI_API_KEY: 'test-key', SEED_OPENAI_BASE_URL: baseUrl, NO_COLOR: '1', FORCE_COLOR: '0' };
}

async function runSeed(cwd: string, env: NodeJS.ProcessEnv, args: string[]): Promise<{ code: number; stdout: string }> {
  return execFileAsync(process.execPath, ['--import', tsxLoader, entry, ...args, '--json', '--no-input'], { cwd, env, timeout: 60_000, windowsHide: true }).then(
    ({ stdout }) => ({ code: 0, stdout }),
    (error: { code?: number; stdout?: string }) => ({ code: error.code ?? 1, stdout: error.stdout ?? '' }),
  );
}

describe('CLI entry source hygiene', () => {
  it('starts with the shebang and no UTF-8 byte order mark', async () => {
    const bytes = await readFile(entrySource);
    expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(bytes.subarray(0, 2).toString('utf8')).toBe('#!');
  });

  it('does not render the garden picker label with mojibake in place of a dash', async () => {
    const source = await readFile(entrySource, 'utf8');
    expect(source).not.toContain('??${statusLabel');
  });
});

describe('CLI prune with an explicit item', () => {
  let root: string;
  let work: string;
  let home: string;
  let unreachableUrl: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-prune-explicit-'));
    work = path.join(root, 'work');
    home = path.join(root, 'home');
    await mkdir(work); await mkdir(home, { recursive: true });
    await plant(new SeedStore(work), 'A small team tracker for missed commitments');
    // Bind and release a port so the provider URL is refused rather than hanging.
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const address = probe.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    unreachableUrl = `http://127.0.0.1:${port}/v1`;
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('prunes a named item without calling the AI provider or saving suggestions', async () => {
    const conversationDir = path.join(work, '.seed', 'conversations');
    const before = await readdir(conversationDir).catch(() => []);
    const result = await runSeed(work, cliEnv(home, unreachableUrl), ['prune', 'Notifications', '--provider', 'openai']);
    expect(result.code).toBe(0);
    const updated = JSON.parse(result.stdout) as { prunedItems: string[] };
    expect(updated.prunedItems).toContain('Notifications');
    expect(await readdir(conversationDir).catch(() => [])).toHaveLength(before.length);
  }, 60_000);
});
