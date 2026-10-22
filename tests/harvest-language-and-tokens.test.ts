import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createSeed, type HarvestType } from '../src/domain.js';
import { generateHarvestDocument, type HarvestInput } from '../src/ai/harvest-document.js';
import type { ProviderMessage } from '../src/ai/contracts.js';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxLoader = pathToFileURL(path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
const entry = path.join(repoRoot, 'src', 'cli', 'index.ts');
const koreanIdea = '팀원들이 매일 아침 오늘 할 일을 짧게 공유하고 마감 전에 알려주는 작은 도구를 만들고 싶어요.';

// Mirrors the scripted provider in tests/cli.test.ts, kept local so this file stays self-contained.
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
  return JSON.stringify({ question: 'Who would you most like to try this idea first?', maturityDelta: 5, focus: 'user' });
}

describe('harvest document language follows the idea', () => {
  let root: string;
  let work: string;
  let env: NodeJS.ProcessEnv;
  let server: Server;
  const systemPrompts: string[] = [];

  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-harvest-lang-'));
    work = path.join(root, 'work');
    const home = path.join(root, 'home');
    await mkdir(work);
    await mkdir(home, { recursive: true });
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { messages?: Array<{ role: string; content?: string }> };
        const system = (body.messages ?? []).filter((message) => message.role === 'system').map((message) => message.content ?? '').join('\n');
        const promptText = body.messages?.[body.messages.length - 1]?.content ?? '';
        if (promptText.startsWith('HARVEST_DOCUMENT\n')) systemPrompts.push(system);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: scriptedContent(promptText) } }] }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}/v1`;
    env = { ...process.env, SEED_HOME: home, SEED_LANG: 'en', SEED_OPENAI_AUTH_FILE: path.join(home, 'missing-auth.json'), SEED_OPENAI_API_KEY: 'test-key', SEED_OPENAI_BASE_URL: baseUrl, NO_COLOR: '1', FORCE_COLOR: '0' };
    await writeFile(path.join(home, 'config.json'), JSON.stringify({ version: 1, activeProvider: 'openai', providers: [{ id: 'openai', name: 'openai', type: 'openai', defaultModel: 'test-model', enabled: true, baseUrl }] }));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });

  it('writes a Korean idea document when the UI language is English', async () => {
    const run = (...args: string[]) => execFileAsync(process.execPath, ['--import', tsxLoader, entry, ...args, '--json', '--no-input', '--provider', 'openai'], { cwd: work, env, timeout: 60_000, windowsHide: true });
    await run(koreanIdea);
    await run('harvest', 'idea', '--draft');
    expect(systemPrompts.length).toBeGreaterThan(0);
    expect(systemPrompts.at(-1)).toContain('Write an idea document in Korean.');
  }, 60_000);
});

describe('harvest document grammar', () => {
  const idea = 'Users enter a task name and save the task to a list. No login or payments.';
  const seed = createSeed(idea);
  const input: HarvestInput = { evidence: [{ id: 'idea', text: idea }], excluded: [] };

  it.each<[HarvestType, string]>([['idea', 'Write an idea document in English.'], ['prd', 'Write a prd document in English.']])('uses the correct article for %s', async (type, expected) => {
    const sent: ProviderMessage[][] = [];
    const provider = { id: 'test', model: 'test-model', ask: vi.fn(), stream: vi.fn(), testConnection: vi.fn(), listModels: vi.fn(),
      chat: vi.fn(async (messages: ProviderMessage[]) => {
        sent.push(messages);
        const content = messages.at(-1)!.content;
        if (content.startsWith('HARVEST_REVIEW\n')) return JSON.stringify({ verdicts: [{ id: 'c1', supported: true }] });
        const request = JSON.parse(content.slice('HARVEST_DOCUMENT\n'.length)) as { sections: string[]; input: HarvestInput };
        const source = request.input.evidence[0]!;
        return JSON.stringify({ claims: [{ id: 'c1', section: 'overview', text: source.text, evidence: [{ sourceId: source.id, quote: source.text }] }],
          missing: request.sections.filter((id) => id !== 'overview') });
      }) };
    await generateHarvestDocument(seed, type, 'en', input, { provider: provider as never });
    expect(sent[0]!.map((message) => message.content).join('\n')).toContain(expected);
  });
});
