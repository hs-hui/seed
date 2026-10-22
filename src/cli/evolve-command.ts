import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { select } from '@inquirer/prompts';
import type { SeedState } from '../domain.js';
import { slugify } from '../domain.js';
import { currentLanguage, t } from '../i18n/index.js';
import { SeedStore } from '../storage/store.js';
import { evolutionSuggestions } from '../ai/provider.js';
import { addEvent, plant } from '../core/seed-manager.js';
import { latestSuggestions, saveSuggestions } from '../core/suggestions.js';
import type { CommonOptions } from './config-commands.js';

export function registerEvolveCommand(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
}): void {
  const { addCommon, run, targetStore, currentSeed, print } = deps;
  const evolve = addCommon(program.command('evolve').description(t('help.evolve'))).argument('[selection]', t('cli.evolveArgument'));
  evolve.action(async (selection: string | undefined, options: CommonOptions) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant');
    const shown = selection ? await latestSuggestions<{ name: string; summary: string }>(store, seed.id, 'evolve') : undefined;
    const suggestions = shown ?? await evolutionSuggestions(seed, options.provider, options.model, currentLanguage());
    if (!selection) {
      await saveSuggestions(store, seed.id, 'evolve', suggestions);
      if (options.json || !process.stdin.isTTY || options.input === false) { print({ suggestions }, Boolean(options.json)); return; }
    }
    let selected = selection ? suggestions.find((item) => item.name.toLowerCase() === selection.toLowerCase()) : undefined;
    if (!selected && selection) { const index = Number(selection) - 1; if (Number.isInteger(index) && index >= 0) selected = suggestions[index]; }
    if (!selected) {
      if (selection) throw new Error('evolve-selection-not-found');
      const index = await select({ message: t('evolve.choose'), choices: suggestions.map((item, position) => ({ name: `${position + 1}. ${item.name} — ${item.summary}`, value: position })) });
      selected = suggestions[index];
    }
    if (!selected) throw new Error('evolve-selection-not-found');
    // Invalid selections must not append AI suggestions to history; a list that was never shown is saved only once it resolves.
    if (selection && !shown) await saveSuggestions(store, seed.id, 'evolve', suggestions);
    const childRoot = path.join(store.root, `${slugify(seed.name)}-evolved-${Date.now()}`); await mkdir(childRoot, { recursive: true });
    const childStore = new SeedStore(childRoot); const child = await plant(childStore, `${seed.coreIdea} — ${selected.name}`, undefined, seed.id);
    await addEvent(store, seed, 'evolve', `Evolved into ${selected.name}`, { childPath: childRoot, childSeedId: child.id });
    if (options.json) print({ parentSeedId: seed.id, childSeedId: child.id, path: childRoot, direction: selected }, true);
    else console.log(t('evolve.created', { name: child.name, path: childRoot }));
  }, options));
}
