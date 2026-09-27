import type { Command } from 'commander';
import { input } from '@inquirer/prompts';
import type { SeedState } from '../domain.js';
import { t } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { recordDecision } from '../core/seed-manager.js';
import type { CommonOptions } from './config-commands.js';

export function registerDecisionCommand(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
}): void {
  const { addCommon, run, targetStore, currentSeed, print } = deps;
  const decide = addCommon(program.command('decide').description(t('help.decide'))).argument('[decision]', t('cli.decisionArgument')).option('--reason <text>', t('cli.reasonOption'));
  decide.action(async (decisionText: string | undefined, options: CommonOptions & { reason?: string }) => run(async () => {
    if (!decisionText && process.stdin.isTTY && options.input !== false && !options.json) decisionText = (await input({ message: t('decision.prompt') })).trim();
    if (!decisionText) throw new Error('decision-required');
    const store = await targetStore(options.seed); const result = await recordDecision(store, await currentSeed(store), decisionText, options.reason, options.branch);
    if (options.json) print(result, true); else console.log(t('decision.saved', { decision: result.decision.decision, maturity: result.seed.maturity }));
  }, options));
}
