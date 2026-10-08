import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import { getProvider } from '../src/ai/provider.js';
import { registerConfigCommands } from '../src/cli/config-commands.js';
import { configWizard, persistConfig } from '../src/cli/config-setup.js';
import { plant } from '../src/core/seed-manager.js';
import { setLanguage } from '../src/i18n/index.js';
import { SeedStore, loadConfig } from '../src/storage/store.js';

// The setup wizard asks through these prompts; each test scripts its answers.
vi.mock('@inquirer/prompts', () => ({ input: vi.fn(), select: vi.fn() }));

const KEY = 'sk-user-secret';
const COLLECTOR = 'collector.example.test';
const COLLECTOR_URL = `https://${COLLECTOR}/v1`;
// The user's own providers, as they live in $SEED_HOME/config.json.
const userProviders = [
  { id: 'openai', name: 'openai', type: 'openai', defaultModel: 'user-gpt', enabled: true, baseUrl: 'https://openai.user.test/v1' },
  { id: 'anthropic', name: 'anthropic', type: 'anthropic', defaultModel: 'user-claude', enabled: true, baseUrl: 'https://anthropic.user.test/v1' },
  { id: 'gemini', name: 'gemini', type: 'gemini', defaultModel: 'user-gemini', enabled: true, baseUrl: 'https://gemini.user.test/v1beta' },
  { id: 'paused', name: 'paused', type: 'custom', defaultModel: 'paused-model', enabled: false, baseUrl: 'https://paused.user.test/v1' },
];
const baseOf = (id: string): string => userProviders.find((provider) => provider.id === id)?.baseUrl ?? '';
// Every variable a key or an endpoint can come from. They are cleared for each
// test so the developer's shell can neither leak into nor redirect requests.
const isolatedEnv = ['SEED_HOME', 'SEED_OPENAI_AUTH_FILE', 'SEED_OPENAI_BASE_URL', 'SEED_OPENAI_MODEL', 'SEED_OPENAI_OAUTH_MODEL', 'OPENAI_API_KEY', 'SEED_OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'SEED_ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'SEED_GEMINI_API_KEY', 'SEED_API_KEY', 'SEED_COLLECTOR_API_KEY', 'SEED_TEAM_LLM_API_KEY'];

type SentRequest = { url: string; headers: Record<string, string>; body: string };
let home: string;
let work: string;
let sent: SentRequest[];
let previousCwd: string;
let previousEnv: Record<string, string | undefined>;
let previousExitCode: typeof process.exitCode;
let originalFetch: typeof fetch;

const globalFile = (): string => path.join(home, 'config.json');
const projectFile = (): string => path.join(work, '.seed', 'config.json');
async function readJsonFile<T = Record<string, unknown>>(file: string): Promise<T> { return JSON.parse(await readFile(file, 'utf8')) as T; }
async function writeGlobal(overrides: Record<string, unknown> = {}): Promise<void> {
  await writeFile(globalFile(), JSON.stringify({ version: 1, activeProvider: 'openai', providers: userProviders, ...overrides }));
}
async function writeProject(value: unknown): Promise<void> {
  await mkdir(path.dirname(projectFile()), { recursive: true });
  await writeFile(projectFile(), JSON.stringify(value));
}
async function enterProject(): Promise<void> {
  await plant(new SeedStore(work), 'A cloned idea');
  process.chdir(work);
}
/** The key a request carries: an OpenAI bearer token, Anthropic header or Gemini query. */
function keyIn(request: SentRequest): string | null {
  return request.headers.authorization?.replace(/^Bearer /, '') ?? request.headers['x-api-key'] ?? new URL(request.url).searchParams.get('key');
}
function expectKeySentOnlyTo(base: string): void {
  expect(sent.length).toBeGreaterThan(0);
  for (const request of sent) {
    expect(request.url.startsWith(`${base}/`), request.url).toBe(true);
    expect(keyIn(request)).toBe(KEY);
  }
  expect(JSON.stringify(sent)).not.toContain(COLLECTOR);
  expect(JSON.stringify(sent)).not.toContain('project-model');
}
/** Run `seed config ...` in-process through the real command handlers. */
async function seedConfig(...args: string[]): Promise<unknown[]> {
  const printed: unknown[] = [];
  const program = new Command().exitOverride();
  registerConfigCommands(program, { run: (action) => action(), jsonRequested: () => true, print: (value) => { printed.push(value); } });
  await program.parseAsync(['config', ...args], { from: 'user' });
  expect(printed).not.toContainEqual(expect.objectContaining({ error: expect.anything() }));
  return printed;
}

beforeEach(async () => {
  previousCwd = process.cwd();
  previousEnv = Object.fromEntries(isolatedEnv.map((name) => [name, process.env[name]]));
  previousExitCode = process.exitCode;
  originalFetch = globalThis.fetch;
  for (const name of isolatedEnv) delete process.env[name];
  home = await mkdtemp(path.join(os.tmpdir(), 'seed-config-security-home-'));
  work = await mkdtemp(path.join(os.tmpdir(), 'seed-config-security-work-'));
  process.env.SEED_HOME = home;
  process.env.SEED_OPENAI_AUTH_FILE = path.join(home, 'missing-auth.json');
  for (const name of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'SEED_API_KEY', 'SEED_COLLECTOR_API_KEY']) process.env[name] = KEY;
  sent = [];
  globalThis.fetch = vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: resource instanceof Request ? resource.url : String(resource), headers: Object.fromEntries(new Headers(init?.headers).entries()), body: typeof init?.body === 'string' ? init.body : '' });
    // One body that satisfies the OpenAI, Anthropic and Gemini parsers.
    return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }], content: [{ text: 'OK' }], candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), { status: 200 });
  }) as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.chdir(previousCwd);
  for (const name of isolatedEnv) { if (previousEnv[name] === undefined) delete process.env[name]; else process.env[name] = previousEnv[name]; }
  process.exitCode = previousExitCode;
  setLanguage('en');
  vi.mocked(input).mockReset();
  vi.mocked(select).mockReset();
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
  await rm(work, { recursive: true, force: true });
});

describe('project config cannot reroute provider credentials', () => {
  it.each(['openai', 'anthropic', 'gemini'])('keeps the global %s endpoint when a project redefines that provider', async (id) => {
    await writeGlobal({ activeProvider: id });
    await enterProject();
    await writeProject({ version: 9, setupCompleted: true, activeProvider: id, providers: [{ id, name: id, type: id, defaultModel: 'project-model', enabled: true, baseUrl: COLLECTOR_URL, temperature: 2, maxTokens: 9 }] });
    const config = await loadConfig();
    expect(config.providers).toEqual(userProviders);
    expect(config).toMatchObject({ version: 1, activeProvider: id });
    expect(config.setupCompleted).toBeUndefined();
    await (await getProvider(undefined, undefined, 'en')).ask('Hello');
    await (await getProvider(id, undefined, 'en')).ask('Hello again');
    expectKeySentOnlyTo(baseOf(id));
  });

  it('ignores a provider that only the project defines, even when the project makes it active', async () => {
    await writeGlobal();
    await enterProject();
    await writeProject({ activeProvider: 'collector', providers: [{ id: 'collector', name: 'collector', type: 'custom', defaultModel: 'project-model', enabled: true, baseUrl: COLLECTOR_URL }] });
    const config = await loadConfig();
    expect(config.providers).toEqual(userProviders);
    expect(config.activeProvider).toBe('openai');
    await expect(getProvider('collector', undefined, 'en')).rejects.toThrow('provider-not-configured:collector');
    await (await getProvider(undefined, undefined, 'en')).ask('Hello');
    expectKeySentOnlyTo(baseOf('openai'));
  });

  it('applies the same rules to a folder that has only .seed/config.json', async () => {
    await writeGlobal();
    await writeProject({ activeProvider: 'collector', providers: [
      { id: 'openai', name: 'openai', type: 'openai', defaultModel: 'project-model', enabled: true, baseUrl: COLLECTOR_URL },
      { id: 'collector', name: 'collector', type: 'custom', defaultModel: 'project-model', enabled: true, baseUrl: COLLECTOR_URL },
    ] });
    await expect(stat(path.join(work, '.seed', 'seed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    process.chdir(work);
    const config = await loadConfig();
    expect(config.providers).toEqual(userProviders);
    expect(config.activeProvider).toBe('openai');
    await (await getProvider(undefined, undefined, 'en')).ask('Hello');
    expectKeySentOnlyTo(baseOf('openai'));
  });
});

describe('project config overrides that remain allowed', () => {
  it('keeps a project language override', async () => {
    await writeGlobal({ lang: 'en' });
    await enterProject();
    await writeProject({ lang: 'ko' });
    expect((await loadConfig()).lang).toBe('ko');
    await writeProject({ lang: 'fr' });
    expect((await loadConfig()).lang).toBe('en');
  });

  it("lets a project choose only one of the user's enabled providers", async () => {
    await writeGlobal();
    await enterProject();
    await writeProject({ activeProvider: 'anthropic' });
    expect((await loadConfig()).activeProvider).toBe('anthropic');
    await (await getProvider(undefined, undefined, 'en')).ask('Hello');
    expectKeySentOnlyTo(baseOf('anthropic'));
    for (const activeProvider of ['unknown', 'paused', 42]) {
      await writeProject({ activeProvider });
      expect((await loadConfig()).activeProvider).toBe('openai');
    }
  });
});

describe('config persistence keeps provider definitions global', () => {
  it('saves provider definitions globally and only the language and provider choice in the project', async () => {
    await writeGlobal({ lang: 'en', setupCompleted: true });
    await enterProject();
    const config = await loadConfig();
    config.lang = 'ko';
    config.providers.push({ id: 'team', name: 'team', type: 'custom', defaultModel: 'team-model', enabled: true, baseUrl: 'https://team.user.test/v1' });
    config.activeProvider = 'team';
    await persistConfig(config);
    const project = await readFile(projectFile(), 'utf8');
    expect(JSON.parse(project)).toEqual({ lang: 'ko', activeProvider: 'team' });
    expect(project).not.toMatch(/providers|baseUrl|setupCompleted/);
    const global = await readJsonFile<{ providers: unknown[] }>(globalFile());
    expect(global).toMatchObject({ version: 1, lang: 'en', activeProvider: 'openai', setupCompleted: true });
    expect(global.providers).toEqual([...userProviders, expect.objectContaining({ id: 'team', baseUrl: 'https://team.user.test/v1' })]);
    expect(await loadConfig()).toMatchObject({ lang: 'ko', activeProvider: 'team' });
  });

  it('drops a provider list that an older version wrote into the project', async () => {
    await writeGlobal();
    await enterProject();
    await writeProject({ version: 1, lang: 'ko', activeProvider: 'legacy', setupCompleted: true, providers: [...userProviders, { id: 'legacy', name: 'legacy', type: 'custom', defaultModel: 'project-model', enabled: true, baseUrl: COLLECTOR_URL }] });
    const config = await loadConfig();
    expect(config.providers).toEqual(userProviders);
    expect(config).toMatchObject({ lang: 'ko', activeProvider: 'openai' });
    await persistConfig(config);
    expect(await readJsonFile(projectFile())).toEqual({ lang: 'ko', activeProvider: 'openai' });
    expect((await readJsonFile<{ providers: unknown[] }>(globalFile())).providers).toEqual(userProviders);
  });

  it('keeps saving everything to the global config outside a project', async () => {
    await writeGlobal();
    process.chdir(work);
    const config = await loadConfig();
    config.lang = 'ko';
    config.activeProvider = 'anthropic';
    config.providers = config.providers.map((provider) => provider.id === 'anthropic' ? { ...provider, defaultModel: 'next-claude' } : provider);
    await persistConfig(config);
    const global = await readJsonFile<{ providers: unknown[] }>(globalFile());
    expect(global).toMatchObject({ lang: 'ko', activeProvider: 'anthropic' });
    expect(global.providers).toContainEqual(expect.objectContaining({ id: 'anthropic', defaultModel: 'next-claude' }));
    await expect(stat(path.join(work, '.seed'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('gives the global config a default provider and language when the first setup runs inside a project', async () => {
    await enterProject();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.mocked(select).mockResolvedValueOnce('custom');
    vi.mocked(input).mockResolvedValueOnce('team-llm').mockResolvedValueOnce('https://llm.user.test/v1').mockResolvedValueOnce('team-model');
    setLanguage('ko');
    await configWizard();
    expect(sent.map((request) => request.url)).toEqual(['https://llm.user.test/v1/chat/completions']);
    // setupCompleted is global, so the chosen language must be too; otherwise
    // the next run elsewhere would skip setup and fall back to English.
    expect(await readJsonFile(globalFile())).toMatchObject({ version: 1, lang: 'ko', activeProvider: 'team-llm', setupCompleted: true, providers: [expect.objectContaining({ id: 'team-llm', type: 'custom', baseUrl: 'https://llm.user.test/v1' })] });
    expect(await readJsonFile(projectFile())).toEqual({ lang: 'ko', activeProvider: 'team-llm' });
  });

  it('routes config command changes made inside a project to the file that owns them', async () => {
    await writeGlobal({ lang: 'en', setupCompleted: true, providers: userProviders.slice(0, 2) });
    await enterProject();
    const project = (): Promise<Record<string, unknown>> => readJsonFile(projectFile());
    const global = (): Promise<{ lang?: string; activeProvider: string; providers: Array<{ id: string }> }> => readJsonFile(globalFile());

    expect(await seedConfig('use', 'anthropic')).toEqual([{ activeProvider: 'anthropic' }]);
    expect(await project()).toEqual({ lang: 'en', activeProvider: 'anthropic' });
    expect((await global()).activeProvider).toBe('openai');

    for (const [key, value] of [['model', 'next-claude'], ['baseUrl', 'https://anthropic.next.test/v1'], ['temperature', '0.3'], ['maxTokens', '512']] as const) await seedConfig('set', key, value);
    expect((await global()).providers).toContainEqual({ ...userProviders[1], defaultModel: 'next-claude', baseUrl: 'https://anthropic.next.test/v1', temperature: 0.3, maxTokens: 512 });
    expect(await project()).toEqual({ lang: 'en', activeProvider: 'anthropic' });

    await seedConfig('set', 'provider', 'gemini');
    expect((await global()).providers.map((provider) => provider.id)).toEqual(['openai', 'anthropic', 'gemini']);
    expect(await project()).toEqual({ lang: 'en', activeProvider: 'gemini' });

    await seedConfig('set', 'lang', 'ko');
    expect(await project()).toEqual({ lang: 'ko', activeProvider: 'gemini' });
    expect((await global()).lang).toBe('en');

    await seedConfig('remove', 'gemini');
    expect((await global()).providers.map((provider) => provider.id)).toEqual(['openai', 'anthropic']);
    expect(await global()).toMatchObject({ lang: 'en', activeProvider: 'openai' });
    expect(await project()).toEqual({ lang: 'ko' });
    expect((await loadConfig()).activeProvider).toBe('openai');

    await seedConfig('unset', 'lang');
    expect(await project()).not.toHaveProperty('lang');
    expect((await loadConfig()).lang).toBe('en');
  });
});
