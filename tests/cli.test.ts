import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const entry = path.join(repoRoot, 'src', 'cli', 'index.ts');

// Runs the real CLI in a child process so argument parsing, stdout JSON, and
// on-disk state are exercised together. Credentials from the developer's
// environment are stripped so only the local provider can answer.
function isolatedEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('SEED_') || /API_KEY$/.test(key)) delete env[key];
  }
  return { ...env, SEED_HOME: home, SEED_LANG: 'en', SEED_OPENAI_AUTH_FILE: path.join(home, 'missing-auth.json'), NO_COLOR: '1', FORCE_COLOR: '0' };
}

describe('seed CLI end-to-end (local provider)', () => {
  let root: string;
  let work: string;
  let env: NodeJS.ProcessEnv;

  const seed = async <T = unknown>(...args: string[]): Promise<T> => {
    const { stdout } = await execFileAsync(process.execPath, [tsxCli, entry, ...args, '--json', '--no-input', '--provider', 'local'], { cwd: work, env, timeout: 60_000, windowsHide: true });
    return JSON.parse(stdout) as T;
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-cli-e2e-'));
    work = path.join(root, 'work');
    await mkdir(work);
    env = isolatedEnv(path.join(root, 'home'));
  });

  afterAll(async () => { await rm(root, { recursive: true, force: true }); });

  it('plants a seed and returns the first question as JSON', async () => {
    const planted = await seed<{ id: string; originalIdea: string; maturity: number; firstQuestion: string }>('A habit tracker for remote teams');
    expect(planted.originalIdea).toBe('A habit tracker for remote teams');
    expect(planted.firstQuestion.length).toBeGreaterThan(0);
    const saved = JSON.parse(await readFile(path.join(work, '.seed', 'seed.json'), 'utf8')) as { id: string };
    expect(saved.id).toBe(planted.id);
  }, 60_000);

  it('grows the seed with answers and raises maturity', async () => {
    const before = JSON.parse(await readFile(path.join(work, '.seed', 'seed.json'), 'utf8')) as { maturity: number };
    const first = await seed<{ after: string; maturity: number }>('grow', '--answer', 'Remote engineering managers who run async teams');
    expect(first.after).toContain('Remote engineering managers');
    expect(first.maturity).toBeGreaterThan(before.maturity);
    const second = await seed<{ maturity: number }>('grow', '--answer', 'Standups drift and nobody notices missed commitments until the sprint ends');
    expect(second.maturity).toBeGreaterThanOrEqual(first.maturity);
  }, 60_000);

  it('reports bloom dimensions for the grown seed', async () => {
    const bloom = await seed<{ maturity: number; dimensions: Array<{ name: string; score: number }>; clear: string[] }>('bloom');
    expect(bloom.dimensions).toHaveLength(8);
    expect(bloom.clear).toContain('user');
  }, 60_000);

  it('harvests every document type and versions repeated harvests', async () => {
    const all = await seed<{ type: string; file: string[] }>('harvest', 'all');
    expect(all.type).toBe('all');
    const names = all.file.map((file) => path.basename(file)).sort();
    expect(names).toEqual(['brief-v1.md', 'idea-v1.md', 'prd-v1.md', 'prompt-v1.md', 'readme-v1.md', 'trd-v1.md']);
    const prd = await readFile(path.join(work, '.seed', 'harvest', 'prd-v1.md'), 'utf8');
    expect(prd).toContain('Remote engineering managers');

    const again = await seed<{ type: string; file: string }>('harvest', 'prd');
    expect(path.basename(again.file)).toBe('prd-v2.md');
    expect((await readdir(path.join(work, '.seed', 'harvest'))).filter((name) => name.startsWith('prd-'))).toEqual(['prd-v1.md', 'prd-v2.md']);
  }, 120_000);

  it('records the flow in history', async () => {
    const events = await seed<Array<{ type: string }>>('history');
    const types = new Set(events.map((event) => event.type));
    expect(types.size).toBeGreaterThan(1);
  }, 60_000);

  it('fails with a JSON error when no idea is given without input', async () => {
    const empty = path.join(root, 'empty');
    await mkdir(empty);
    const result = await execFileAsync(process.execPath, [tsxCli, entry, '--json', '--no-input', '--provider', 'local'], { cwd: empty, env, timeout: 60_000, windowsHide: true }).then(
      (value) => ({ code: 0, stdout: value.stdout }),
      (error: { code?: number; stdout?: string }) => ({ code: error.code ?? 1, stdout: error.stdout ?? '' }),
    );
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout)).toHaveProperty('error');
  }, 60_000);
});
