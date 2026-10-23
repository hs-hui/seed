import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { SeedStore } from '../src/storage/store.js';
import { plant } from '../src/core/seed-manager.js';
import { registerShapeCommands } from '../src/cli/shape-commands.js';
import { registerEvolveCommand } from '../src/cli/evolve-command.js';
import { registerWaterCommand } from '../src/cli/water-command.js';
import { useScriptedProvider } from './test-support/scripted-provider.js';

// Each AI suggestion call returns the same items in a different order, so a
// selection that regenerates the list would pick a different item than the one shown.
const listKeys: Array<[marker: string, key: string]> = [['BRANCH_SUGGEST', 'branches'], ['EVOLVE_SUGGEST', 'suggestions'], ['WATER_PERSPECTIVES', 'perspectives']];

function rotateSuggestionOrder(scripted: typeof fetch): typeof fetch {
  const calls = new Map<string, number>();
  return vi.fn(async (url: string, init?: RequestInit) => {
    const response = await scripted(url, init);
    const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
    const prompt = body.messages?.[body.messages.length - 1]?.content ?? '';
    const match = listKeys.find(([marker]) => prompt.includes(marker));
    if (!match) return response;
    const [marker, key] = match;
    const count = calls.get(marker) ?? 0; calls.set(marker, count + 1);
    const payload = await response.json() as { choices: Array<{ message: { content: string } }> };
    const parsed = JSON.parse(payload.choices[0]!.message.content) as Record<string, unknown[]>;
    const items = parsed[key]!;
    parsed[key] = [...items.slice(count % items.length), ...items.slice(0, count % items.length)];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(parsed) } }] }), { status: 200 });
  }) as typeof fetch;
}

// A fresh Commander program per call: subcommand option state is kept between parses.
async function invoke(store: SeedStore, args: string[]): Promise<unknown[]> {
  const output: unknown[] = [];
  const program = new Command().exitOverride();
  const deps = {
    addCommon: (command: Command) => command.option('--json').option('--no-input'),
    run: async (action: () => Promise<void>) => action(),
    targetStore: async () => store,
    currentSeed: async (current: SeedStore) => current.load(),
    print: (value: unknown) => { output.push(value); },
  };
  registerShapeCommands(program, deps);
  registerEvolveCommand(program, deps);
  registerWaterCommand(program, deps);
  await program.parseAsync(args, { from: 'user' });
  return output;
}

describe('suggestion selection', () => {
  let stopScriptedProvider: () => Promise<void>;
  let root: string;
  let store: SeedStore;
  beforeEach(async () => {
    stopScriptedProvider = await useScriptedProvider();
    globalThis.fetch = rotateSuggestionOrder(globalThis.fetch);
    root = await mkdtemp(path.join(os.tmpdir(), 'seed-selection-'));
    store = new SeedStore(root);
    await plant(store, 'A tiny idea whose choices must stay stable');
  });
  afterEach(async () => {
    await stopScriptedProvider();
    await rm(root, { recursive: true, force: true });
  });

  it('branch selects from the list that was shown, not a regenerated one', async () => {
    const [shown] = await invoke(store, ['branch', '--no-input']) as Array<{ suggestions: Array<{ name: string }> }>;
    const [created] = await invoke(store, ['branch', '1', '--json']) as Array<{ name: string }>;
    expect(created!.name).toBe(shown!.suggestions[0]!.name);
  });

  it('evolve selects from the list that was shown, not a regenerated one', async () => {
    const [shown] = await invoke(store, ['evolve', '--no-input']) as Array<{ suggestions: Array<{ name: string }> }>;
    const [evolved] = await invoke(store, ['evolve', '1', '--json']) as Array<{ direction: { name: string } }>;
    expect(evolved!.direction.name).toBe(shown!.suggestions[0]!.name);
  });

  it('water selects from the perspectives that were shown, not a regenerated one', async () => {
    const [shown] = await invoke(store, ['water', '--no-input']) as Array<{ perspectives: Array<{ id: string }> }>;
    const [watered] = await invoke(store, ['water', '1', '--json']) as Array<{ perspective: { id: string } }>;
    expect(watered!.perspective.id).toBe(shown!.perspectives[0]!.id);
  });
});
