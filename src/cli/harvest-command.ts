import type { Command } from 'commander';
import { select } from '@inquirer/prompts';
import type { HarvestType, SeedState } from '../domain.js';
import { currentLanguage, t } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { harvest, harvestTitle } from '../core/harvest.js';
import { assessHarvestReadiness } from '../core/harvest-readiness.js';
import type { CommonOptions } from './config-commands.js';

export function registerHarvestCommand(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  jsonRequested: (options?: CommonOptions) => boolean;
  print: (value: unknown, json?: boolean) => void;
}): void {
  const { addCommon, run, targetStore, currentSeed, jsonRequested, print } = deps;
  const harvestCommand = addCommon(program.command('harvest').description(t('help.harvest'))).argument('[type]', t('cli.harvestArgument')).option('--draft', t('cli.draftOption'));
  harvestCommand.action(async (type: HarvestType | 'all' | undefined, options: CommonOptions & { draft?: boolean }) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store);
    if (!type && process.stdin.isTTY && options.input !== false && !jsonRequested(options)) {
      const choices = ['idea', 'brief', 'prd', 'trd', 'readme', 'prompt', 'all'] as const;
      type = await select({ message: t('harvest.select'), choices: choices.map((value) => ({ name: harvestTitle(value, currentLanguage()), value })) });
    }
    type ??= 'idea';
    if (!['idea', 'brief', 'prd', 'trd', 'readme', 'prompt', 'all'].includes(type)) throw new Error('invalid-harvest');
    const types: HarvestType[] = type === 'all' ? ['idea', 'brief', 'prd', 'trd', 'readme', 'prompt'] : [type];
    const incomplete = types.map((entry) => assessHarvestReadiness(seed, entry)).filter((entry) => !entry.ready);
    if (incomplete.length && !options.draft) {
      if (jsonRequested(options)) print({ error: 'harvest-not-ready', readiness: incomplete }, true);
      else {
        console.error(t('harvest.notReady'));
        for (const entry of incomplete) {
          const missing = entry.missing.map((item) => t(`harvest.evidence.${item}`)).join(', ');
          console.error(`- ${harvestTitle(entry.type, currentLanguage())}: ${missing}`);
        }
        console.error(t('harvest.draftHint'));
      }
      process.exitCode = 1;
      return;
    }
    const file = await harvest(store, seed, type, currentLanguage(), { draft: options.draft, ai: true, providerId: options.provider, model: options.model });
    print(options.json ? { type, file } : t('harvest.saved', { type: harvestTitle(type, currentLanguage()), file: Array.isArray(file) ? file.join(', ') : file }), Boolean(options.json));
  }, options));
}
