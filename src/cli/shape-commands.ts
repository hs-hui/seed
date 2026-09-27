import type { Command } from 'commander';
import { checkbox, select } from '@inquirer/prompts';
import type { SeedState } from '../domain.js';
import { t, currentLanguage } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { addConversation } from '../core/seed-manager.js';
import { branchSuggestions, createBranch, pruneItem, pruneSuggestions } from '../core/branch.js';
import type { CommonOptions } from './config-commands.js';

export function registerShapeCommands(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
}): void {
  const { addCommon, run, targetStore, currentSeed, print } = deps;

  const branch = addCommon(program.command('branch').description(t('help.branch'))).argument('[selection]', t('cli.branchArgument'));
  branch.action(async (selection: string | undefined, options: CommonOptions) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const branches = await store.branches(seed.id);
    if (selection === 'list') {
      if (!branches.length) print(options.json ? [] : t('branch.listEmpty'), Boolean(options.json));
      else print(options.json ? branches : branches.map((b) => `${b.status === 'active' ? '🌿' : '✂️'} ${b.name} (${b.maturity}%)`).join('\n'), Boolean(options.json));
      return;
    }
    if (selection) {
      const suggestions = await branchSuggestions(seed, options.provider, options.model, currentLanguage()); const index = Number(selection) - 1;
      const selected = Number.isInteger(index) && index >= 0 ? suggestions[index] : suggestions.find((s) => s.name.toLowerCase() === selection.toLowerCase());
      if (!selected) throw new Error('branch-selection-not-found');
      // Invalid selections must not append AI suggestions to history.
      for (const suggestion of suggestions) await addConversation(store, { seedId: seed.id, role: 'assistant', type: 'insight', content: `${suggestion.name}: ${suggestion.summary}`, metadata: { source: 'branch' } });
      const created = await createBranch(store, seed, selected.name, selected.summary, options.provider);
      print(options.json ? created : t('branch.created', { name: created.name }), Boolean(options.json)); return;
    }
    const suggestions = await branchSuggestions(seed, options.provider, options.model, currentLanguage());
    for (const suggestion of suggestions) await addConversation(store, { seedId: seed.id, role: 'assistant', type: 'insight', content: `${suggestion.name}: ${suggestion.summary}`, metadata: { source: 'branch' } });
    if (options.json || !process.stdin.isTTY || options.input === false) { print({ suggestions }, Boolean(options.json)); return; }
    console.log(t('branch.title'));
    const selected = await select({ message: t('branch.select', { count: suggestions.length }), choices: suggestions.map((s, i) => ({ name: `${i + 1}. ${s.name} — ${s.summary}`, value: i })) });
    const choice = suggestions[selected]; if (!choice) throw new Error('branch-selection-not-found');
    const created = await createBranch(store, seed, choice.name, choice.summary, options.provider); console.log(t('branch.created', { name: created.name }));
  }, options));

  const prune = addCommon(program.command('prune').description(t('help.prune'))).argument('[item]', t('cli.pruneArgument'));
  prune.action(async (item: string | undefined, options: CommonOptions) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const suggestions = await pruneSuggestions(seed, options.provider, options.model, currentLanguage());
    for (const suggestion of suggestions) await addConversation(store, { seedId: seed.id, role: 'assistant', type: 'prune-suggestion', content: `${suggestion.item} — ${suggestion.reason}`, metadata: { source: 'prune' } });
    item ??= options.branch;
    let items: string[] = item ? [item] : [];
    if (!item) {
      if (options.json || !process.stdin.isTTY || options.input === false) { print({ suggestions }, Boolean(options.json)); return; }
      if (!suggestions.length) { console.log(t('prune.none')); return; }
      // Pruning is reversible and can shape several non-core items at once.
      items = await checkbox({ message: t('prune.title'), choices: suggestions.map((s) => ({ name: `${s.item} — ${s.reason}`, value: s.item })) });
      if (!items.length) { console.log(t('prune.none')); return; }
    }
    let updated = seed;
    for (const selected of items) updated = await pruneItem(store, await store.load(), selected, currentLanguage());
    if (options.json) print(updated, true);
    else console.log(`${t('prune.done', { item: items.join(', ') })}\n${t('prune.core')}: "${updated.coreIdea}"`);
  }, options));
}
