import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import { confirm, input, select } from '@inquirer/prompts';
import type { SeedState } from '../domain.js';
import { now } from '../domain.js';
import { currentLanguage, t } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { classifyGrowthInput } from '../ai/provider.js';
import { applyGrowth, changeGrowthQuestion, isGrowthPauseRequest, isQuestionChangeRequest } from '../core/growth.js';
import { restoreItem, wake, wither } from '../core/lifecycle.js';
import { addConversation } from '../core/seed-manager.js';
import { printGrowthQuestion, printGrowthSignals } from './growth-session.js';
import type { CommonOptions } from './config-commands.js';

export function registerLifecycleCommands(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
  workspace: { exitRequested: boolean };
}): void {
  const { addCommon, run, targetStore, currentSeed, print, workspace } = deps;

  const witherCommand = addCommon(program.command('wither').description(t('help.wither')));
  witherCommand.action(async (options: CommonOptions) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store);
    if (process.stdin.isTTY && !options.json && options.input !== false && seed.status !== 'dormant') {
      const accepted = await confirm({ message: t('wither.confirm'), default: false });
      if (!accepted) { console.log(t('wither.cancelled')); return; }
    }
    const updated = await wither(store, seed); print(options.json ? updated : t('wither.done'), Boolean(options.json));
  }, options));

  const wakeCommand = addCommon(program.command('wake').description(t('help.wake')));
  wakeCommand.action(async (options: CommonOptions) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store); const eventsBeforeWake = await store.events(seed.id); const updated = await wake(store, seed); print(options.json ? updated : t('wake.done'), Boolean(options.json));
    if (seed.status !== 'dormant' || options.json || options.input === false || !process.stdin.isTTY || updated.status === 'dormant') return;
    const lastActivity = eventsBeforeWake.map((event) => Date.parse(event.createdAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    const days = lastActivity ? Math.max(0, Math.floor((Date.now() - lastActivity) / 86_400_000)) : 0;
    console.log(t('wake.context', { days }));
    const question = t('wake.changePrompt'); const answer = await input({ message: question });
    if (/^\/(?:exit|quit|q)$/i.test(answer.trim())) {
      workspace.exitRequested = true;
      console.log(t('repl.exit'));
      return;
    }
    if (!answer.trim()) return;
    const latest = await store.load(); const openQuestion = { id: randomUUID(), seedId: latest.id, question, focus: 'validation' as const, importance: 'medium' as const, status: 'open' as const, createdAt: now() };
    await addConversation(store, { seedId: latest.id, role: 'assistant', type: 'question', content: question, metadata: { focus: 'validation', source: 'wake' } });
    await store.save({ ...latest, openQuestions: [...latest.openQuestions, openQuestion], updatedAt: now() });
    if (isGrowthPauseRequest(answer)) { console.log(t('grow.pause')); return; }
    if (isQuestionChangeRequest(answer)) {
      const next = await changeGrowthQuestion(store, await store.load(), options.provider, undefined, options.model, currentLanguage(), answer);
      console.log(`${t('grow.changeQuestion')}\n`); printGrowthQuestion(next, false); return;
    }
    const wakeIntent = await classifyGrowthInput(answer, question, options.provider, options.model, currentLanguage());
    if (wakeIntent === 'pause') { console.log(t('grow.pause')); return; }
    if (wakeIntent === 'change-question') {
      const next = await changeGrowthQuestion(store, await store.load(), options.provider, undefined, options.model, currentLanguage(), answer);
      console.log(`${t('grow.changeQuestion')}\n`); printGrowthQuestion(next, false); return;
    }
    const result = await applyGrowth(store, await store.load(), answer, options.provider, undefined, currentLanguage(), options.model);
    console.log(`${t('grow.update')}\n${t('grow.before')}: "${result.before}"\n${t('grow.now')}:    "${result.after}"\n\n${t('grow.saved', { maturity: result.seed.maturity })}`); printGrowthSignals(result.update);
  }, options));

  const restore = addCommon(program.command('restore').description(t('help.restore'))).argument('[item]', t('cli.restoreArgument'));
  restore.action(async (item: string | undefined, options: CommonOptions) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store); const branches = (await store.branches(seed.id)).filter((branch) => branch.status === 'pruned');
    if (!item && options.json) { print({ branches, items: seed.prunedItems }, true); return; }
    if (!item && process.stdin.isTTY && options.input !== false) { const choices = [...branches.map((branch) => ({ name: `🌿 ${branch.name}`, value: branch.id })), ...seed.prunedItems.map((value) => ({ name: value, value }))]; if (!choices.length) { console.log(t('restore.empty')); return; } item = await select({ message: t('restore.choose'), choices }); }
    if (!item) throw new Error('restore-not-found');
    const updated = await restoreItem(store, seed, item); print(options.json ? updated : t('restore.done', { item }), Boolean(options.json));
  }, options));
}
