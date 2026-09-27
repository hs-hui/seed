import type { Command } from 'commander';
import type { SeedState } from '../domain.js';
import { t, currentLanguage } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { askGrowthQuestion, applyGrowth, changeGrowthQuestion, isGrowthPauseRequest, isQuestionChangeRequest } from '../core/growth.js';
import { classifyGrowthInput } from '../ai/provider.js';
import { interactiveGrowthSession, printGrowthQuestion, printGrowthSignals } from './growth-session.js';
import type { CommonOptions } from './config-commands.js';

export function registerGrowCommand(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
  workspace: { exitRequested: boolean; depth: number; interactiveRepl: (options: Pick<CommonOptions, 'provider' | 'model'>) => Promise<void> };
}): void {
  const { addCommon, run, targetStore, currentSeed, print, workspace } = deps;
  const grow = addCommon(program.command('grow').description(t('help.grow'))).option('--answer <text>', t('cli.answerOption')).option('--no-interactive', t('cli.noInteractiveOption'));
  grow.action(async (options: CommonOptions & { answer?: string; interactive?: boolean }) => run(async () => {
    const store = await targetStore(options.seed); let seed = await currentSeed(store);
    if (seed.status === 'dormant') throw new Error('seed-dormant');
    const branchId = options.branch ?? seed.activeBranch;
    let answer = options.answer;
    if (answer !== undefined) {
      if (!answer.trim()) throw new Error('answer-required');
      // Scripted one-turn usage (`grow --answer`) may be invoked repeatedly.
      // If the previous turn already closed its question, create the next one
      // first so the answer is classified against the right growth focus.
      if (!seed.openQuestions.some((question) => question.status === 'open' && question.branchId === branchId)) {
        await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
        seed = await store.load();
      }
      if (isQuestionChangeRequest(answer)) {
        const question = await changeGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage(), answer);
        if (options.json) print({ changedQuestion: true, question, maturity: (await store.load()).maturity }, true);
        else { console.log(`${t('grow.changeQuestion')}\n`); printGrowthQuestion(question, false); }
        return;
      }
      if (isGrowthPauseRequest(answer)) {
        const question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
        if (options.json) print({ paused: true, question, maturity: (await store.load()).maturity }, true);
        else console.log(t('grow.pause'));
        return;
      }
      const pendingQuestion = seed.openQuestions.find((entry) => entry.status === 'open' && entry.branchId === branchId)?.question ?? '';
      const aiIntent = await classifyGrowthInput(answer, pendingQuestion, options.provider, options.model, currentLanguage());
      if (aiIntent === 'pause') {
        const question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
        if (options.json) print({ paused: true, question, maturity: (await store.load()).maturity }, true);
        else console.log(t('grow.pause'));
        return;
      }
      if (aiIntent === 'change-question') {
        const question = await changeGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage(), answer);
        if (options.json) print({ changedQuestion: true, question, maturity: (await store.load()).maturity }, true);
        else { console.log(`${t('grow.changeQuestion')}\n`); printGrowthQuestion(question, false); }
        return;
      }
      const result = await applyGrowth(store, seed, answer, options.provider, branchId, currentLanguage(), options.model);
      seed = result.seed;
      if (options.json) print({ before: result.before, after: result.after, maturity: seed.maturity, status: seed.status, update: result.update }, true);
      else { console.log(`${t('grow.update')}\n${t('grow.before')}: "${result.before}"\n${t('grow.now')}:    "${result.after}"\n\n${t('grow.saved', { maturity: seed.maturity })}`); printGrowthSignals(result.update); if (result.after.length > 180) console.log(`\n${t('grow.pruneHint')}`); }
      return;
    }
    const interactive = options.interactive !== false && process.stdin.isTTY && !options.json && options.input !== false;
    if (!interactive) {
      const question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
      print({ question }, Boolean(options.json));
      return;
    }
    // An explicit `seed grow` invocation always gets one turn, even when the
    // previous session reached the pause threshold; this is how users resume
    // exploration and reach validation questions.
    await interactiveGrowthSession(workspace, store, seed, options, undefined, true, branchId);
    if (workspace.depth === 0 && !workspace.exitRequested) await workspace.interactiveRepl(options);
  }, options));
}
