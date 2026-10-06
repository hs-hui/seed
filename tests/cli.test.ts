import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxLoader = pathToFileURL(path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
const entry = path.join(repoRoot, 'src', 'cli', 'index.ts');

/**
 * Minimal OpenAI-compatible chat-completions mock. The CLI now requires a
 * real configured AI provider for every AI-backed command, so this starts a
 * local HTTP server and points the child process at it via
 * SEED_OPENAI_BASE_URL instead of relying on the retired local fallback.
 */
function scriptedContent(promptText: string): string {
  if (promptText.startsWith('HARVEST_DOCUMENT\n')) {
    const request = JSON.parse(promptText.slice('HARVEST_DOCUMENT\n'.length)) as { sections: string[]; input: { evidence: Array<{ id: string; text: string }> } };
    return JSON.stringify({ claims: request.input.evidence.map((entry, index) => ({ id: `c${index + 1}`, section: index === 0 ? 'overview' : 'requirements', text: entry.text, evidence: [{ sourceId: entry.id, quote: entry.text }] })),
      missing: request.sections.filter((id) => id !== 'overview' && (id !== 'requirements' || request.input.evidence.length === 1)) });
  }
  if (promptText.startsWith('HARVEST_REVIEW\n')) {
    const request = JSON.parse(promptText.slice('HARVEST_REVIEW\n'.length)) as { claims: Array<{ id: string }> };
    return JSON.stringify({ verdicts: request.claims.map((claim) => ({ id: claim.id, supported: true })) });
  }
  const value = (label: string): string => promptText.match(new RegExp(`(?:^|\\n)${label}:([^\\n]*)`))?.[1]?.trim() ?? '';
  if (promptText.includes('GROW_INPUT_CLASSIFY')) return JSON.stringify({ intent: 'answer' });
  if (promptText.includes('GROW_UPDATE')) {
    const coreIdea = value('coreIdea') || value('originalIdea');
    const answer = value('latestAnswer');
    return JSON.stringify({ updatedSummary: `${coreIdea} — ${answer}`.slice(0, 240), questionReason: 'I folded your answer into the current idea.', contradictionsDetected: [], suggestions: [], maturityDelta: 5 });
  }
  if (promptText.includes('BLOOM_EVALUATE')) {
    const dims = ['problem', 'user', 'core value', 'differentiation', 'scope', 'feasibility', 'motivation', 'confidence'];
    return JSON.stringify({ dimensions: dims.map((name) => ({ name, score: 70, reason: 'Supported by the current seed state.' })), clear: dims.slice(0, 5), uncertain: dims.slice(5), explore: dims.slice(5) });
  }
  if (promptText.includes('BRANCH_SUGGEST')) return JSON.stringify({ branches: [
    { name: 'Team focus', summary: 'Track commitments for one team.' },
    { name: 'Manager focus', summary: 'Show managers missed commitments.' },
  ] });
  if (promptText.includes('PRUNE_SUGGEST')) return JSON.stringify({ items: [
    { item: 'Team focus', reason: 'Defer this direction for the first version.' },
  ] });
  if (promptText.includes('SUNLIGHT_ANALYZE')) return JSON.stringify({
    areas: [
      { name: 'Users', findings: ['Talk to remote managers.'], facts: ['The team uses async updates.'], estimates: ['A reminder may help.'] },
      { name: 'Alternatives', findings: ['Compare the existing tracker.'], facts: [], estimates: [] },
      { name: 'First version', findings: ['Try a small pilot.'], facts: [], estimates: [] },
    ],
    assumptions: ['Managers want reminders.'],
    openQuestions: ['How do managers notice missed commitments today?'],
  });
  if (promptText.includes('WATER_PERSPECTIVES')) return JSON.stringify({ perspectives: [
    { id: 'people', name: 'People', question: 'Who needs this most?' },
    { id: 'benefit', name: 'Benefit', question: 'What would be easier?' },
    { id: 'building', name: 'Building', question: 'What could you make first?' },
    { id: 'experience', name: 'Experience', question: 'When would people use it?' },
  ] });
  if (promptText.includes('WATER_DETAIL')) return JSON.stringify({
    title: 'People at work', summary: 'Managers need to spot missed commitments.',
    points: ['Ask how they check progress.', 'Try one team first.'], assumptions: ['A reminder would be welcome.'],
  });
  if (promptText.includes('EVOLVE_SUGGEST')) return JSON.stringify({ suggestions: [
    { name: 'Morning check-in', summary: 'Start with one daily team update.' },
    { name: 'Weekly review', summary: 'Help managers see missed work each week.' },
  ] });
  if (promptText.includes('GROW_QUESTION')) {
    const users = value('users');
    const question = users ? 'What moment is hardest for the team?' : 'Who would you most like to try this idea first?';
    return JSON.stringify({ question, maturityDelta: 5, focus: users ? 'problem' : 'user' });
  }
  return JSON.stringify({ question: 'Who would you most like to try this idea first?', maturityDelta: 5, focus: 'user' });
}

async function startMockOpenAI(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { messages?: Array<{ content?: string }> };
      const promptText = body.messages?.[body.messages.length - 1]?.content ?? '';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: scriptedContent(promptText) } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}/v1` };
}

function isolatedEnv(home: string, baseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('SEED_') || /API_KEY$/.test(key)) delete env[key];
  }
  return { ...env, SEED_HOME: home, SEED_LANG: 'en', SEED_OPENAI_AUTH_FILE: path.join(home, 'missing-auth.json'), SEED_OPENAI_API_KEY: 'test-key', SEED_OPENAI_BASE_URL: baseUrl, NO_COLOR: '1', FORCE_COLOR: '0' };
}

describe('seed CLI end-to-end (scripted OpenAI provider)', () => {
  let root: string;
  let work: string;
  let env: NodeJS.ProcessEnv;
  let mockServer: Server;

  const seed = async <T = unknown>(...args: string[]): Promise<T> => {
    const { stdout } = await execFileAsync(process.execPath, ['--import', tsxLoader, entry, ...args, '--json', '--no-input', '--provider', 'openai'], { cwd: work, env, timeout: 60_000, windowsHide: true });
    return JSON.parse(stdout) as T;
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-cli-e2e-'));
    work = path.join(root, 'work');
    const home = path.join(root, 'home');
    await mkdir(work);
    await mkdir(home, { recursive: true });
    const mock = await startMockOpenAI();
    mockServer = mock.server;
    env = isolatedEnv(home, mock.url);
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'openai', type: 'openai', defaultModel: 'test-model', enabled: true, baseUrl: mock.url }] }));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

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
    const rejected = await execFileAsync(process.execPath, ['--import', tsxLoader, entry, 'harvest', 'all', '--json', '--no-input'], { cwd: work, env, timeout: 60_000, windowsHide: true }).then(
      (value) => ({ code: 0, stdout: value.stdout }),
      (error: { code?: number; stdout?: string }) => ({ code: error.code ?? 1, stdout: error.stdout ?? '' }),
    );
    expect(rejected.code).not.toBe(0);
    const refusal = JSON.parse(rejected.stdout) as { error: string; readiness: Array<{ type: string; missing: string[] }> };
    expect(refusal.error).toBe('harvest-not-ready');
    expect(refusal.readiness.some((entry) => entry.type === 'trd' && entry.missing.includes('technical-direction'))).toBe(true);
    expect((await readdir(path.join(work, '.seed', 'harvest'))).filter((name) => name.endsWith('.md'))).toEqual([]);

    const all = await seed<{ type: string; file: string[] }>('harvest', 'all', '--draft');
    expect(all.type).toBe('all');
    const names = all.file.map((file) => path.basename(file)).sort();
    expect(names).toEqual(['brief-v1.md', 'idea-v1.md', 'prd-v1.md', 'prompt-v1.md', 'readme-v1.md', 'trd-v1.md']);
    const prd = await readFile(path.join(work, '.seed', 'harvest', 'prd-v1.md'), 'utf8');
    expect(prd).toMatch(/^> DRAFT - missing evidence:/);
    expect(prd).toContain('Remote engineering managers');
    const idea = await readFile(path.join(work, '.seed', 'harvest', 'idea-v1.md'), 'utf8');
    expect(idea).not.toContain('DRAFT -');
    const readme = await readFile(path.join(work, '.seed', 'harvest', 'readme-v1.md'), 'utf8');
    expect(readme).not.toContain('npm install');
    expect(readme).not.toContain('MIT');

    const again = await seed<{ type: string; file: string }>('harvest', 'prd', '--draft');
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
    const result = await execFileAsync(process.execPath, ['--import', tsxLoader, entry, '--json', '--no-input', '--provider', 'openai'], { cwd: empty, env, timeout: 60_000, windowsHide: true }).then(
      (value) => ({ code: 0, stdout: value.stdout }),
      (error: { code?: number; stdout?: string }) => ({ code: error.code ?? 1, stdout: error.stdout ?? '' }),
    );
    expect(result.code).not.toBe(0);
    expect(JSON.parse(result.stdout)).toHaveProperty('error');
  }, 60_000);

  it('stores sunlight research separately and retains a harvested seed status', async () => {
    const result = await seed<{ research: Array<{ source: string; isEstimate: boolean }>; sources: unknown[]; maturity: number }>('sunlight', '--no-web');
    expect(result.sources).toEqual([]);
    expect(result.research).toHaveLength(5);
    expect(result.research).toContainEqual(expect.objectContaining({ source: 'ai://sunlight/facts', isEstimate: false }));
    expect(result.research).toContainEqual(expect.objectContaining({ source: 'ai://sunlight/estimates', isEstimate: true }));
    const saved = JSON.parse(await readFile(path.join(work, '.seed', 'seed.json'), 'utf8')) as { status: string; assumptions: string[]; openQuestions: Array<{ question: string }> };
    expect(saved.status).toBe('harvested');
    expect(saved.assumptions).toContain('Managers want reminders.');
    expect(saved.openQuestions).toContainEqual(expect.objectContaining({ question: 'How do managers notice missed commitments today?' }));
    expect(await readdir(path.join(work, '.seed', 'research'))).toHaveLength(5);
  }, 60_000);

  it('stores a chosen water perspective and preserves harvest through bloom', async () => {
    const listed = await seed<{ perspectives: Array<{ id: string }> }>('water');
    expect(listed.perspectives).toHaveLength(4);
    const watered = await seed<{ perspective: { id: string }; research: { id: string; source: string } }>('water', 'people', '--answer', 'Managers review the board each morning');
    expect(watered.perspective.id).toBe('people');
    expect(watered.research.source).toBe('water:people');
    const record = JSON.parse(await readFile(path.join(work, '.seed', 'research', `${watered.research.id}.json`), 'utf8')) as { summary: string };
    expect(record.summary).toContain('Managers review the board each morning');

    const bloom = await seed<{ status: string; dimensions: unknown[] }>('bloom');
    expect(bloom.status).toBe('harvested');
    expect(bloom.dimensions).toHaveLength(8);
  }, 60_000);

  it('suggests, creates, lists, and prunes a branch', async () => {
    expect(await seed<Array<unknown>>('branch', 'list')).toEqual([]);
    const proposed = await seed<{ suggestions: Array<{ name: string }> }>('branch');
    expect(proposed.suggestions.map((suggestion) => suggestion.name)).toEqual(['Team focus', 'Manager focus']);

    const conversationDir = path.join(work, '.seed', 'conversations');
    const beforeInvalidSelection = (await readdir(conversationDir)).length;
    const invalid = await execFileAsync(process.execPath, ['--import', tsxLoader, entry, 'branch', 'missing', '--json', '--no-input', '--provider', 'openai'], { cwd: work, env, timeout: 60_000, windowsHide: true }).then(
      ({ stdout }) => ({ code: 0, stdout }),
      (error: { code?: number; stdout?: string }) => ({ code: error.code ?? 1, stdout: error.stdout ?? '' }),
    );
    expect(invalid.code).not.toBe(0);
    expect(JSON.parse(invalid.stdout)).toEqual({ error: 'branch-selection-not-found' });
    expect((await readdir(conversationDir)).length).toBe(beforeInvalidSelection);

    const created = await seed<{ id: string; name: string; status: string }>('branch', '1');
    expect(created.name).toBe('Team focus');
    expect(created.status).toBe('active');
    expect((await seed<Array<{ id: string; status: string }>>('branch', 'list')).map((branch) => branch.id)).toContain(created.id);

    const suggestions = await seed<{ suggestions: Array<{ item: string }> }>('prune');
    expect(suggestions.suggestions[0].item).toBe('Team focus');
    const pruned = await seed<{ prunedItems: string[]; activeBranch?: string }>('prune', created.id);
    expect(pruned.prunedItems).toContain(created.id);
    expect(pruned.activeBranch).not.toBe(created.id);
    expect(await seed<Array<{ id: string; status: string }>>('branch', 'list')).toContainEqual(expect.objectContaining({ id: created.id, status: 'pruned' }));
  }, 120_000);

  it('restores a pruned branch and resumes from dormancy', async () => {
    const [branch] = await seed<Array<{ id: string; status: string }>>('branch', 'list');
    expect(branch.status).toBe('pruned');
    const available = await seed<{ branches: Array<{ id: string }>; items: string[] }>('restore');
    expect(available.branches.map((entry) => entry.id)).toContain(branch.id);
    const restored = await seed<{ status: string; activeBranch?: string; prunedItems: string[] }>('restore', branch.id);
    expect(restored.activeBranch).toBe(branch.id);
    expect(restored.prunedItems).not.toContain(branch.id);
    expect(await seed<Array<{ id: string; status: string }>>('branch', 'list')).toContainEqual(expect.objectContaining({ id: branch.id, status: 'active' }));

    const dormant = await seed<{ status: string; preDormantStatus: string }>('wither');
    expect(dormant.status).toBe('dormant');
    expect(dormant.preDormantStatus).toBe(restored.status);
    const resumed = await seed<{ status: string; preDormantStatus?: string }>('wake');
    expect(resumed.status).toBe(restored.status);
    expect(resumed.preDormantStatus).toBeUndefined();
  }, 120_000);

  it('records a branch decision and shows project views', async () => {
    const [branch] = await seed<Array<{ id: string }>>('branch', 'list');
    const before = JSON.parse(await readFile(path.join(work, '.seed', 'seed.json'), 'utf8')) as { decisions: unknown[]; maturity: number };
    const decided = await seed<{ decision: { branchId: string; decision: string }; seed: { maturity: number; decisions: unknown[] } }>('decide', 'Start with one team', '--branch', branch.id);
    expect(decided.decision).toEqual(expect.objectContaining({ branchId: branch.id, decision: 'Start with one team' }));
    expect(decided.seed.decisions).toEqual(before.decisions);
    const after = JSON.parse(await readFile(path.join(work, '.seed', 'seed.json'), 'utf8')) as { decisions: unknown[]; maturity: number };
    expect(after.decisions).toEqual(before.decisions);
    expect(after.maturity).toBe(before.maturity);

    const tree = await seed<{ branches: Array<{ id: string; decisions: unknown[] }> }>('tree');
    expect(tree.branches).toContainEqual(expect.objectContaining({ id: branch.id, decisions: [expect.objectContaining({ decision: 'Start with one team' })] }));
    const recent = await seed<Array<{ type: string }>>('history', '--limit', '1');
    expect(recent).toEqual([expect.objectContaining({ type: 'decision' })]);
  }, 120_000);

  it('evolves into a child project discoverable in the garden', async () => {
    const proposed = await seed<{ suggestions: Array<{ name: string }> }>('evolve');
    expect(proposed.suggestions).toHaveLength(2);
    const parent = JSON.parse(await readFile(path.join(work, '.seed', 'seed.json'), 'utf8')) as { id: string };
    const created = await seed<{ parentSeedId: string; childSeedId: string; path: string }>('evolve', '1');
    expect(created.parentSeedId).toBe(parent.id);
    const child = JSON.parse(await readFile(path.join(created.path, '.seed', 'seed.json'), 'utf8')) as { id: string; parentSeedId: string };
    expect(child.id).toBe(created.childSeedId);
    expect(child.parentSeedId).toBe(parent.id);
    const garden = await seed<Array<{ id: string; path: string }>>('garden');
    expect(garden).toContainEqual(expect.objectContaining({ id: created.childSeedId, path: created.path }));
    expect(await seed<{ id: string }>('garden', created.childSeedId)).toEqual(expect.objectContaining({ path: created.path }));
  }, 120_000);
});
