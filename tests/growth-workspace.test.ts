import { afterEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SeedState } from '../src/domain.js';
import { createGrowthWorkspace } from '../src/cli/growth-workspace.js';

vi.mock('@inquirer/prompts', () => ({ input: vi.fn() }));

describe('growth workspace', () => {
  const originalCwd = process.cwd();
  let root: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it('routes free text to grow and restores the garden root on exit', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-workspace-'));
    const answers: string[] = [];
    const program = new Command();
    program.command('grow').option('--answer <text>').action((options: { answer?: string }) => { answers.push(options.answer ?? ''); });
    vi.mocked(input).mockResolvedValueOnce('A clear answer with spaces').mockResolvedValueOnce('/exit');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const workspace = createGrowthWorkspace({
      program,
      currentSeed: async () => ({ status: 'dormant' }) as SeedState,
      printGrowthQuestion: () => {},
    });

    await workspace.interactiveRepl({}, root);

    expect(answers).toEqual(['A clear answer with spaces']);
    expect(workspace.depth).toBe(0);
    expect(workspace.rootOverride).toBeUndefined();
    expect(process.cwd()).toBe(originalCwd);
  });
});
