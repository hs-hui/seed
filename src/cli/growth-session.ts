import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import type { SeedState } from '../domain.js';
import { t, currentLanguage } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { askGrowthQuestion, applyGrowth, changeGrowthQuestion, growthReady, isGrowthPauseRequest, isQuestionChangeRequest } from '../core/growth.js';
import { classifyGrowthInput } from '../ai/provider.js';
import type { CommonOptions } from './config-commands.js';
import { clearTurnScreen, logoOutput } from './terminal.js';

function maxGrowthTurns(): number {
  const configured = Number(process.env.SEED_MAX_GROW_TURNS);
  return Number.isFinite(configured) && configured > 0 ? Math.min(50, Math.floor(configured)) : 12;
}

export function printGrowthQuestion(question: string, firstTurn: boolean, turn = 0, previousUpdate?: string): void {
  clearTurnScreen();
  console.log(logoOutput);
  if (previousUpdate) console.log(previousUpdate + '\n');
  const followUpKeys = ['grow.followUp', 'grow.followUp.2', 'grow.followUp.3', 'grow.followUp.4'];
  const messageKey = firstTurn ? 'grow.opening' : followUpKeys[turn % followUpKeys.length]!;
  console.log(chalk.green(`🌱 ${t(messageKey)}`));
  console.log(question);
  console.log(chalk.dim(t('grow.finishHint')));
}

async function promptGrowthAnswer(question: string, firstTurn: boolean, turn = 0, previousUpdate?: string): Promise<string> {
  printGrowthQuestion(question, firstTurn, turn, previousUpdate);
  return input({ message: t('grow.answerPrompt') });
}

type GrowthSessionOptions = Pick<CommonOptions, 'provider' | 'model'>;

/** Run the conversational loop used by both `seed` and `seed grow`. */
export async function interactiveGrowthSession(
  session: { exitRequested: boolean },
  store: SeedStore,
  initialSeed: SeedState,
  options: GrowthSessionOptions,
  initialQuestion?: string,
  forceOneTurn = false,
  branchId?: string,
): Promise<SeedState> {
  session.exitRequested = false;
  let seed = initialSeed;
  let question = initialQuestion ?? await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
  seed = await store.load();
  let turns = 0;
  let prompts = 0;
  const promptLimit = maxGrowthTurns() + 8;
  let pendingUpdate: string | undefined;
  // Parent readiness cannot close a branch conversation because branch
  // answers intentionally do not fill the parent's required fields. Branch
  // growth therefore advances one explicit turn at a time.
  while ((branchId ? turns === 0 : ((forceOneTurn && turns === 0) || !growthReady(seed))) && turns < maxGrowthTurns() && prompts < promptLimit) {
    prompts += 1;
    // A question-change request can happen before the first answer. Use the
    // prompt count for the opening label so that retrying a question does not
    // print the welcome line twice in the same conversation.
    const answer = await promptGrowthAnswer(question, prompts === 1, turns, pendingUpdate);
    pendingUpdate = undefined;
    if (/^\/(?:exit|quit|q)$/i.test(answer.trim())) {
      session.exitRequested = true;
      console.log(t('repl.exit'));
      break;
    }
    if (!answer.trim()) break;
    if (isGrowthPauseRequest(answer)) {
      console.log(`\n${t('grow.pause')}`);
      break;
    }
    if (isQuestionChangeRequest(answer)) {
      question = await changeGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage(), answer);
      seed = await store.load();
      console.log(`\n${t('grow.changeQuestion')}`);
      continue;
    }
    const aiIntent = await classifyGrowthInput(answer, question, options.provider, options.model, currentLanguage());
    if (aiIntent === 'pause') {
      console.log(`\n${t('grow.pause')}`);
      break;
    }
    if (aiIntent === 'change-question') {
      question = await changeGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage(), answer);
      seed = await store.load();
      console.log(`\n${t('grow.changeQuestion')}`);
      continue;
    }
    const result = await applyGrowth(store, seed, answer, options.provider, branchId, currentLanguage(), options.model);
    seed = result.seed;
    turns += 1;
    const updateSummary = formatGrowthUpdate(result.before, result.after, seed.maturity, result.update);
    if (growthReady(seed)) {
      // Growth is ready to close: print the final update directly since
      // there is no next question to redraw the screen around.
      console.log(updateSummary);
      break;
    }
    question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
    seed = await store.load();
    pendingUpdate = updateSummary;
  }
  if (!branchId && growthReady(seed)) console.log(`\n${t('grow.ready')}`);
  else if (!branchId && turns >= maxGrowthTurns()) console.log(`\n${t('grow.limit', { turns })}`);
  else if (!branchId && prompts >= promptLimit) console.log(`\n${t('grow.interactionLimit')}`);
  return seed;
}


type GrowthUpdateSignals = { questionReason: string; contradictionsDetected: string[]; suggestions: string[] };

/** Render the growth-signal lines (reason, contradictions, suggestions) as
 * text instead of printing directly, so a caller can bundle them with the
 * before/after summary and redraw everything together on the next turn. */
export function formatGrowthSignals(update: GrowthUpdateSignals): string {
  const lines: string[] = [];
  if (update.questionReason) lines.push(chalk.dim(`${t('grow.reason')}: ${update.questionReason}`));
  if (update.contradictionsDetected.length) {
    lines.push(`\n${chalk.yellow(t('grow.contradictions'))}`);
    for (const item of update.contradictionsDetected) lines.push(`  - ${item}`);
  }
  if (update.suggestions.length) {
    lines.push(`\n${chalk.cyan(t('grow.suggestions'))}`);
    for (const item of update.suggestions) lines.push(`  - ${item}`);
  }
  return lines.join('\n');
}

export function printGrowthSignals(update: GrowthUpdateSignals): void {
  const text = formatGrowthSignals(update);
  if (text) console.log(text);
}

/** Render the before/after growth summary plus its signals as one block,
 * used both for the final "ready to harvest" message and to redraw a past
 * turn's result above the next question. */
export function formatGrowthUpdate(before: string, after: string, maturity: number, update: GrowthUpdateSignals): string {
  const lines = [t('grow.update'), `${t('grow.before')}: "${before}"`, `${t('grow.now')}:    "${after}"`, '', t('grow.saved', { maturity })];
  const signals = formatGrowthSignals(update);
  if (signals) lines.push('', signals);
  if (after.length > 180) lines.push('', t('grow.pruneHint'));
  return lines.join('\n');
}
