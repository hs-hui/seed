#!/usr/bin/env node
import { Command } from 'commander';
import { checkbox, confirm, input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Branch, HarvestType, ResearchEntry, SeedState, now, slugify } from '../domain.js';
import { initializeLanguage, t, currentLanguage, setLanguage } from '../i18n/index.js';
import { openStore, SeedStore, loadConfig, saveConfig, saveProjectConfig, type ProviderConfig } from '../storage/store.js';
import { addConversation, plant, addEvent, recordDecision } from '../core/seed-manager.js';
import { askGrowthQuestion, applyGrowth, changeGrowthQuestion, growthReady, isGrowthPauseRequest, isQuestionChangeRequest } from '../core/growth.js';
import { branchSuggestions, createBranch, pruneItem, pruneSuggestions } from '../core/branch.js';
import { calculateMaturity, statusForMaturity } from '../core/maturity.js';
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_OAUTH_MODEL, classifyGrowthInput, dimensionsFor, evaluateMaturity, evolutionSuggestions, getProvider, inferProviderLanguage, isBeginnerFriendlyQuestion, providerKey, sunlightAnalysis, testProviderConnection, waterInsight, waterPerspectives } from '../ai/provider.js';
import { loginOpenAI, getOpenAIToken } from '../ai/openai-oauth.js';
import { harvest, harvestTitle } from '../core/harvest.js';
import { webSources } from '../core/sunlight.js';
import { gardenEntries } from '../core/garden.js';
import { restoreItem, wake, wither } from '../core/lifecycle.js';
import { findSeedRoot } from '../utils/path.js';

type CommonOptions = { lang?: string; json?: boolean; provider?: string; model?: string; seed?: string; branch?: string; setup?: boolean; web?: boolean; input?: boolean; since?: string };
const hasFlag = (name: string): boolean => process.argv.some((argument) => argument === name || argument.startsWith(`${name}=`));
const SEED_LOGO = [
  '███████╗███████╗███████╗██████╗',
  '██╔════╝██╔════╝██╔════╝██╔══██╗',
  '███████╗█████╗  █████╗  ██║  ██║',
  '╚════██║██╔══╝  ██╔══╝  ██║  ██║',
  '███████║███████╗███████╗██████╔╝',
  '╚══════╝╚══════╝╚══════╝╚═════╝',
].join('\n');
function startupLanguage(): string | undefined {
  const langIndex = process.argv.indexOf('--lang');
  const inline = process.argv.find((argument) => argument.startsWith('--lang='))?.slice('--lang='.length);
  const explicit = inline ?? (langIndex >= 0 ? process.argv[langIndex + 1] : undefined);
  if (explicit !== undefined) return explicit === 'ko' || explicit === 'en' ? explicit : 'en';
  if (process.env.SEED_LANG !== undefined) return process.env.SEED_LANG === 'ko' || process.env.SEED_LANG === 'en' ? process.env.SEED_LANG : 'en';
  const projectRoots: string[] = [];
  let projectRoot = path.resolve(process.cwd());
  while (true) {
    projectRoots.push(projectRoot);
    const parent = path.dirname(projectRoot);
    if (parent === projectRoot) break;
    projectRoot = parent;
  }
  const candidates = [...projectRoots.map((root) => path.join(root, '.seed', 'config.json')), path.join(process.env.SEED_HOME ?? path.join(os.homedir(), '.seed'), 'config.json')];
  for (const file of candidates) {
    try { const value = JSON.parse(readFileSync(file, 'utf8')) as { lang?: string }; if (value.lang === 'ko' || value.lang === 'en') return value.lang; } catch { /* config may not exist on first run */ }
  }
  // English is a deliberate product default. Users can opt into Korean via
  // --lang, SEED_LANG, or the persisted first-run setting; the host locale
  // must not silently change a fresh CLI session.
  return 'en';
}
const startupLang = startupLanguage();
setLanguage(startupLang);
const program = new Command();
// Commander emits parser errors before command actions run. Route those
// errors through the same language catalog as runtime failures so a Korean
// session does not suddenly switch to an English CLI error.
program.configureOutput({
  outputError: (message, write) => {
    const clean = message.trim();
    // Commander reports parser errors before a command action can reach
    // `run()`. Keep --json machine-readable on that early failure path too.
    if (hasFlag('--json')) process.stdout.write(`${JSON.stringify({ error: clean })}\n`);
    else write(`${t('error.generic', { message: clean })}\n`);
  },
});
const helpTitleKeys: Record<string, string> = {
  'Usage:': 'cli.help.usage',
  'Arguments:': 'cli.help.arguments',
  'Options:': 'cli.help.options',
  'Global Options:': 'cli.help.globalOptions',
  'Commands:': 'cli.help.commands',
};
program.configureHelp({
  styleTitle: (title: string) => {
    const key = helpTitleKeys[title];
    return key ? t(key, {}, currentLanguage()) : title;
  },
});
program.name('seed').description(t('help.description')).version('0.1.0', '-V, --version', t('cli.versionOption')).helpOption('-h, --help', t('cli.helpOption'))
  .argument('[idea]', t('cli.ideaArgument')).option('--lang <lang>', t('cli.langOption')).option('--json', t('cli.jsonOption')).option('--setup', t('cli.setupOption')).option('--provider <id>', t('cli.providerOption')).option('--model <name>', t('cli.modelOption')).option('--seed <id-or-name>', t('cli.seedOption')).option('--no-input', t('cli.noInputOption'))
  .action(async (idea: string | undefined, options: CommonOptions) => run(() => plantCommand(idea, options), options));

function addCommon(command: Command): Command {
  return command.option('--lang <lang>', t('cli.langOption')).option('--json', t('cli.jsonOption')).option('--provider <id>', t('cli.providerOption')).option('--model <name>', t('cli.modelOption')).option('--seed <id-or-name>', t('cli.seedOption')).option('--branch <id>', t('cli.branchOption')).option('--no-input', t('cli.noInputOption')).option('--since <date>', t('cli.sinceOption')).helpOption('-h, --help', t('cli.helpOption'));
}
function run(action: () => Promise<void>, options: CommonOptions = {}): Promise<void> {
  // Commander keeps duplicate global options on the parent command when a
  // subcommand is used. Merge them back so `seed tree --json` behaves like
  // every other command.
  Object.assign(options, { ...program.opts(), ...options });
  if (hasFlag('--json')) options.json = true;
  if (process.argv.includes('--no-input')) options.input = false;
  return initializeLanguage(options.lang).then(action).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // JSON mode is intended for scripts: keep the single error object on
    // stdout (the logo and human-readable diagnostics stay on stderr).
    if (options.json) { console.log(JSON.stringify({ error: message })); process.exitCode = 1; return; }
    if (message === 'no-seed') console.error(t('error.noSeed'));
    else if (message === 'seed-exists') console.error(t('error.seedExists'));
    else if (message === 'idea-required') console.error(t('error.ideaRequired'));
    else if (message === 'answer-required') console.error(t('grow.answerRequired'));
    else if (message === 'seed-dormant') console.error(t('error.seedDormant'));
    else if (message === 'seed-selection-not-found') console.error(t('error.seedSelectionNotFound'));
    else if (message === 'decision-required') console.error(t('error.decisionRequired'));
    else if (message === 'branch-name-required') console.error(t('error.branchNameRequired'));
    else if (message === 'branch-summary-required') console.error(t('error.branchSummaryRequired'));
    else if (message === 'prune-item-required') console.error(t('error.pruneItemRequired'));
    else if (message === 'oauth-client-id-required') console.error(t('error.oauthClientId'));
    else if (message === 'provider-credential-missing') console.error(t('error.providerCredentialMissing'));
    else if (message === 'provider-empty-response') console.error(t('error.providerEmptyResponse'));
    else if (message === 'water-lens-not-found') console.error(t('error.waterLensNotFound'));
    else if (message === 'evolve-selection-not-found') console.error(t('error.evolveSelectionNotFound'));
    else if (message === 'branch-selection-not-found') console.error(t('error.branchSelectionNotFound'));
    else if (message === 'branch-not-active') console.error(t('error.branchNotActive'));
    else if (message === 'restore-not-found') console.error(t('error.restoreNotFound'));
    else if (message === 'restore-not-pruned') console.error(t('error.restoreNotPruned'));
    else if (message === 'too-many-branches') console.error(t('branch.tooMany'));
    else if (message === 'invalid-harvest') console.error(t('harvest.invalid'));
    else if (message === 'invalid-limit') console.error(t('error.invalidLimit'));
    else if (message === 'invalid-since') console.error(t('error.invalidSince'));
    else if (message === 'invalid-language') console.error(t('error.invalidLanguage'));
    else if (message === 'invalid-model-setting') console.error(t('error.invalidModelSetting'));
    else if (message === 'base-url-required') console.error(t('error.baseUrlRequired'));
    else if (message.startsWith('provider-not-configured:')) console.error(t('error.invalidProvider', { provider: message.slice('provider-not-configured:'.length) }));
    else if (message.startsWith('provider-disabled:')) console.error(t('error.providerDisabled', { provider: message.slice('provider-disabled:'.length) }));
    else console.error(t('error.generic', { message }));
    process.exitCode = 1;
  });
}
async function currentSeed(store: SeedStore): Promise<SeedState> {
  if (!(await store.hasSeed())) throw new Error('no-seed');
  return store.load();
}
// A garden entry can open a nested interactive workspace without changing the
// user's shell directory permanently. Commands entered through that workspace
// use this root as their default target; explicit --seed still wins.
let replRootOverride: string | undefined;
let sessionExitRequested = false;
async function targetStore(selector?: string): Promise<SeedStore> {
  // Read-only commands must not create `.seed/` in an ordinary directory.
  // Planting remains the sole entry point that intentionally creates a root.
  const currentRoot = replRootOverride ?? await findSeedRoot() ?? path.resolve(process.cwd());
  const current = new SeedStore(currentRoot);
  const entries = await gardenEntries(current.root);
  if (!selector) {
    if (entries.length <= 1) return entries[0] ? new SeedStore(entries[0].path) : current;
    // Interactive commands choose a Seed when a garden contains more than
    // one project. JSON/non-interactive callers keep the nearest project as
    // a deterministic default and can opt into another with --seed.
    if (process.stdin.isTTY && !hasFlag('--json') && !process.argv.includes('--no-input')) {
      const selected = await select({ message: t('garden.choose'), choices: entries.map((entry) => ({ name: `${entry.seed.name} (${entry.seed.maturity}%) — ${statusLabel(entry.seed.status)}`, value: entry.path })) });
      return new SeedStore(selected);
    }
    return current;
  }
  const normalized = selector.trim().toLocaleLowerCase();
  const match = entries.find((entry) => entry.seed.id.toLocaleLowerCase() === normalized || entry.seed.name.toLocaleLowerCase() === normalized);
  if (!match) throw new Error('seed-selection-not-found');
  return new SeedStore(match.path);
}
function print(value: unknown, json = false): void {
  if (json) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === 'string') console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}
function statusLabel(status: SeedState['status']): string { return t(`status.${status}`); }
function historyMessage(event: { type: string; message: string; metadata?: Record<string, unknown> }): string {
  const prefixes: Record<string, string> = {
    plant: 'Planted: ', grow: 'Core idea updated: ', branch: 'Branch created: ', prune: 'Pruned: ',
    water: 'Watered through ', bloom: 'Bloom check: ', harvest: 'Harvested ', evolve: 'Evolved into ',
    restore: 'Restored branch: ', decision: 'Decision confirmed: ',
  };
  const prefix = prefixes[event.type];
  if (prefix && event.message.startsWith(prefix) && event.type !== 'grow') return t(`history.message.${event.type}`, { value: event.message.slice(prefix.length) });
  if (event.type === 'restore' && event.message.startsWith('Restored item: ')) return t('history.message.restore', { value: event.message.slice('Restored item: '.length) });
  if (event.type === 'sunlight') return t('history.message.sunlight');
  if (event.type === 'wither') return t('history.message.wither');
  if (event.type === 'wake') return t('history.message.wake');
  const base = prefix && event.message.startsWith(prefix)
    ? t(`history.message.${event.type}`, { value: event.message.slice(prefix.length) })
    : event.message;
  if (event.type === 'grow') {
    const before = typeof event.metadata?.before === 'string' ? event.metadata.before : undefined;
    const after = typeof event.metadata?.after === 'string' ? event.metadata.after : undefined;
    const question = typeof event.metadata?.question === 'string' ? event.metadata.question : undefined;
    const answer = typeof event.metadata?.answer === 'string' ? event.metadata.answer : undefined;
    if (before || after || question || answer) return [base, before ? `  ${t('history.before', { value: before })}` : '', after ? `  ${t('history.after', { value: after })}` : '', question ? `  ${t('history.question', { value: question })}` : '', answer ? `  ${t('history.answer', { value: answer })}` : ''].filter(Boolean).join('\n');
  }
  return base;
}
function maxGrowthTurns(): number {
  const configured = Number(process.env.SEED_MAX_GROW_TURNS);
  return Number.isFinite(configured) && configured > 0 ? Math.min(50, Math.floor(configured)) : 12;
}

function printGrowthQuestion(question: string, firstTurn: boolean, turn = 0): void {
  console.log();
  const followUpKeys = ['grow.followUp', 'grow.followUp.2', 'grow.followUp.3', 'grow.followUp.4'];
  const messageKey = firstTurn ? 'grow.opening' : followUpKeys[turn % followUpKeys.length]!;
  console.log(chalk.green(`🌱 ${t(messageKey)}`));
  console.log(question);
  console.log(chalk.dim(t('grow.finishHint')));
}

async function promptGrowthAnswer(question: string, firstTurn: boolean, turn = 0): Promise<string> {
  printGrowthQuestion(question, firstTurn, turn);
  return input({ message: t('grow.answerPrompt') });
}

type GrowthSessionOptions = Pick<CommonOptions, 'provider' | 'model'>;
const jsonRequested = (options?: CommonOptions): boolean => Boolean(options?.json || hasFlag('--json'));

/** Run the conversational loop used by both `seed` and `seed grow`. */
async function interactiveGrowthSession(
  store: SeedStore,
  initialSeed: SeedState,
  options: GrowthSessionOptions,
  initialQuestion?: string,
  forceOneTurn = false,
  branchId?: string,
): Promise<SeedState> {
  sessionExitRequested = false;
  let seed = initialSeed;
  let question = initialQuestion ?? await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
  seed = await store.load();
  let turns = 0;
  let prompts = 0;
  const promptLimit = maxGrowthTurns() + 8;
  // Parent readiness cannot close a branch conversation because branch
  // answers intentionally do not fill the parent's required fields. Branch
  // growth therefore advances one explicit turn at a time.
  while ((branchId ? turns === 0 : ((forceOneTurn && turns === 0) || !growthReady(seed))) && turns < maxGrowthTurns() && prompts < promptLimit) {
    prompts += 1;
    // A question-change request can happen before the first answer. Use the
    // prompt count for the opening label so that retrying a question does not
    // print the welcome line twice in the same conversation.
    const answer = await promptGrowthAnswer(question, prompts === 1, turns);
    if (/^\/(?:exit|quit|q)$/i.test(answer.trim())) {
      sessionExitRequested = true;
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
    console.log(`${t('grow.update')}\n${t('grow.before')}: "${result.before}"\n${t('grow.now')}:    "${result.after}"\n\n${t('grow.saved', { maturity: seed.maturity })}`);
    printGrowthSignals(result.update);
    if (result.after.length > 180) console.log(`\n${t('grow.pruneHint')}`);
    if (growthReady(seed)) break;
    question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
    seed = await store.load();
  }
  if (!branchId && growthReady(seed)) console.log(`\n${t('grow.ready')}`);
  else if (!branchId && turns >= maxGrowthTurns()) console.log(`\n${t('grow.limit', { turns })}`);
  else if (!branchId && prompts >= promptLimit) console.log(`\n${t('grow.interactionLimit')}`);
  return seed;
}

function tokenizeRepl(line: string): string[] {
  const tokens: string[] = [];
  let token = '';
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of line.trim()) {
    if (escaped) { token += character; escaped = false; continue; }
    if (character === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (character === quote) quote = undefined; else token += character; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (/\s/.test(character)) { if (token) { tokens.push(token); token = ''; } continue; }
    token += character;
  }
  if (escaped) token += '\\';
  if (token) tokens.push(token);
  return tokens;
}

/**
 * Keep a single interactive Seed session open for the full lifecycle. When a
 * turn finishes, queue the next question before returning to the workspace
 * prompt so free-text input still feels like a conversation (even after the
 * essential five fields are complete).
 */
async function announceNextGrowthQuestion(options: GrowthSessionOptions, rootOverride?: string): Promise<void> {
  const store = rootOverride ? new SeedStore(rootOverride) : (replRootOverride ? new SeedStore(replRootOverride) : await openStore());
  const seed = await currentSeed(store);
  if (seed.status === 'dormant') return;
  const branchId = seed.activeBranch;
  const pending = seed.openQuestions.find((entry) => entry.status === 'open' && entry.branchId === branchId);
  // Do not skip the safety check for a question persisted by an older
  // version. Safe pending questions are already printed by the active growth
  // session; stale difficult ones must pass through askGrowthQuestion so they
  // can be cancelled and replaced before the REPL prompt appears.
  if (pending && isBeginnerFriendlyQuestion(pending.question, inferProviderLanguage(currentLanguage(), [seed.originalIdea, seed.coreIdea, pending.question]))) return;
  const question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
  printGrowthQuestion(question, false);
}

let replDepth = 0;
async function interactiveRepl(options: GrowthSessionOptions = {}, rootOverride?: string): Promise<void> {
  const previousRoot = replRootOverride;
  const previousCwd = process.cwd();
  if (rootOverride) {
    replRootOverride = rootOverride;
    process.chdir(rootOverride);
  }
  try {
    await announceNextGrowthQuestion(options, rootOverride);
  const commands = new Set(['grow', 'water', 'branch', 'prune', 'sunlight', 'tree', 'evolve', 'decide', 'bloom', 'harvest', 'history', 'garden', 'wither', 'wake', 'restore', 'config']);
  while (true) {
    let line: string;
    try { line = await input({ message: t('repl.prompt') }); }
    catch { console.log(`\n${t('repl.exit')}`); return; }
    const tokens = tokenizeRepl(line);
    if (!tokens.length) continue;
    const isCommand = tokens[0]!.startsWith('/');
    const command = tokens[0]!.replace(/^\//, '').toLocaleLowerCase();
    if (command === 'exit' || command === 'quit' || command === 'q') { console.log(t('repl.exit')); return; }
    if (command === 'help' || command === '?') { console.log(t('repl.help')); continue; }
    if (!isCommand) {
      // Free text in the workspace is a natural continuation of grow. This
      // keeps the REPL conversational while slash-prefixed input remains an
      // explicit command.
      replDepth += 1;
      try { await program.parseAsync([process.argv[0] ?? 'node', process.argv[1] ?? 'seed', 'grow', '--answer', line], { from: 'node' }); }
      catch (error) { const message = error instanceof Error ? error.message : String(error); console.error(t('error.generic', { message })); }
      finally { replDepth -= 1; }
      if (sessionExitRequested) return;
      await announceNextGrowthQuestion(options, rootOverride);
      continue;
    }
    if (!commands.has(command)) { console.log(t('repl.unknown')); continue; }
    replDepth += 1;
    try {
      await program.parseAsync([process.argv[0] ?? 'node', process.argv[1] ?? 'seed', command, ...tokens.slice(1)], { from: 'node' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(t('error.generic', { message }));
    } finally { replDepth -= 1; }
    if (sessionExitRequested) return;
    if (command === 'grow' || command === 'wake' || command === 'branch' || command === 'prune' || command === 'restore') await announceNextGrowthQuestion(options, rootOverride);
  }
  } finally {
    replRootOverride = previousRoot;
    if (rootOverride) process.chdir(previousCwd);
  }
}

function printGrowthSignals(update: { questionReason: string; contradictionsDetected: string[]; suggestions: string[] }): void {
  if (update.questionReason) console.log(chalk.dim(`${t('grow.reason')}: ${update.questionReason}`));
  if (update.contradictionsDetected.length) {
    console.log(`\n${chalk.yellow(t('grow.contradictions'))}`);
    for (const item of update.contradictionsDetected) console.log(`  - ${item}`);
  }
  if (update.suggestions.length) {
    console.log(`\n${chalk.cyan(t('grow.suggestions'))}`);
    for (const item of update.suggestions) console.log(`  - ${item}`);
  }
}

async function plantCommand(idea: string | undefined, options: CommonOptions): Promise<void> {
  const store = await openStore();
  const hasSeed = await store.hasSeed();
  // `--setup` is also the recovery path for an existing project. Run the
  // wizard before the seed guard and stop after saving configuration there.
  if (options.setup && process.stdin.isTTY && !options.json && options.input !== false) {
    await firstRunSetup(options.lang);
    if (hasSeed) return;
  }
  if (hasSeed) {
    // Re-running bare `seed` in an existing project resumes the same
    // conversation. A new idea still requires a separate project directory,
    // so an explicit idea keeps the guard against accidental overwrite.
    if (!idea && process.stdin.isTTY && !options.json && options.input !== false) {
      const existing = await currentSeed(store);
      if (existing.status === 'dormant') throw new Error('seed-dormant');
      console.log(`${t('resume.title')}\n${t('resume.subtitle')}`);
      // A bare re-run is an explicit request to continue the conversation,
      // even when the previous session had reached the pause threshold.
      await interactiveGrowthSession(store, existing, options, undefined, true);
      if (!sessionExitRequested) await interactiveRepl(options);
      return;
    }
    throw new Error('seed-exists');
  }
  const config = await loadConfig();
  if (process.stdin.isTTY && !options.json && options.input !== false && config.setupCompleted !== true) await firstRunSetup(options.lang);
  if (!idea) {
    if (!process.stdin.isTTY || options.input === false) throw new Error('idea-required');
    console.log(`${t('welcome.title')}\n${t('welcome.subtitle')}`); idea = (await input({ message: t('welcome.prompt') })).trim();
  }
  if (!idea) throw new Error('idea-required');
  if (options.provider) await getProvider(options.provider, options.model, currentLanguage());
  let seed = await plant(store, idea);
  let question = await askGrowthQuestion(store, seed, options.provider, undefined, options.model, currentLanguage());
  seed = await store.load();
  if (options.json) { print({ ...(await store.load()), firstQuestion: question }, true); } else {
    console.log(`${t('plant.created')}\n${t('plant.growNext')}`);
    if (!process.stdin.isTTY || options.input === false) { console.log(`\n${question}`); return; }
    await interactiveGrowthSession(store, seed, options, question);
    if (!sessionExitRequested) await interactiveRepl(options);
  }
}

async function firstRunSetup(explicitLanguage?: string): Promise<void> {
  const envLanguage = process.env.SEED_LANG;
  const requestedLanguage = explicitLanguage ?? envLanguage;
  const forcedLanguage = requestedLanguage === undefined
    ? undefined
    : requestedLanguage === 'ko' || requestedLanguage === 'en' ? requestedLanguage : 'en';
  const language = forcedLanguage === 'ko' || forcedLanguage === 'en'
    ? forcedLanguage
    : await select({ message: t('setup.language'), choices: [
      { name: t('setup.language.en', {}, 'en'), value: 'en' },
      { name: t('setup.language.ko', {}, 'en'), value: 'ko' },
    ] });
  setLanguage(language);
  await configWizard();
  const config = await loadConfig();
  console.log(t('setup.complete'));
  if (config.activeProvider === 'local') console.log(t('setup.local'));
}

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
  await interactiveGrowthSession(store, seed, options, undefined, true, branchId);
  if (replDepth === 0 && !sessionExitRequested) await interactiveRepl(options);
}, options));

const evolve = addCommon(program.command('evolve').description(t('help.evolve'))).argument('[selection]', t('cli.evolveArgument'));
evolve.action(async (selection: string | undefined, options: CommonOptions) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const suggestions = await evolutionSuggestions(seed, options.provider, options.model, currentLanguage());
  if (!selection && (options.json || !process.stdin.isTTY || options.input === false)) {
    for (const suggestion of suggestions) await addConversation(store, { seedId: seed.id, role: 'assistant', type: 'insight', content: `${suggestion.name}: ${suggestion.summary}`, metadata: { source: 'evolve' } });
    print({ suggestions }, Boolean(options.json)); return;
  }
  let selected = selection ? suggestions.find((item) => item.name.toLowerCase() === selection.toLowerCase()) : undefined;
  if (!selected && selection) { const index = Number(selection) - 1; if (Number.isInteger(index) && index >= 0) selected = suggestions[index]; }
  if (!selected) {
    if (selection) throw new Error('evolve-selection-not-found');
    const index = await select({ message: t('evolve.choose'), choices: suggestions.map((item, position) => ({ name: `${position + 1}. ${item.name} — ${item.summary}`, value: position })) });
    selected = suggestions[index];
  }
  if (!selected) throw new Error('evolve-selection-not-found');
  // Validate an explicit selection before recording the suggestion cards. A
  // typo should be a read-only error rather than a hidden conversation turn.
  for (const suggestion of suggestions) await addConversation(store, { seedId: seed.id, role: 'assistant', type: 'insight', content: `${suggestion.name}: ${suggestion.summary}`, metadata: { source: 'evolve' } });
  const childRoot = path.join(store.root, `${slugify(seed.name)}-evolved-${Date.now()}`); await mkdir(childRoot, { recursive: true });
  const childStore = new SeedStore(childRoot); const child = await plant(childStore, `${seed.coreIdea} — ${selected.name}`, undefined, seed.id);
  await addEvent(store, seed, 'evolve', `Evolved into ${selected.name}`, { childPath: childRoot, childSeedId: child.id });
  if (options.json) print({ parentSeedId: seed.id, childSeedId: child.id, path: childRoot, direction: selected }, true);
  else console.log(t('evolve.created', { name: child.name, path: childRoot }));
}, options));

const decide = addCommon(program.command('decide').description(t('help.decide'))).argument('[decision]', t('cli.decisionArgument')).option('--reason <text>', t('cli.reasonOption'));
decide.action(async (decisionText: string | undefined, options: CommonOptions & { reason?: string }) => run(async () => {
  if (!decisionText && process.stdin.isTTY && options.input !== false && !options.json) decisionText = (await input({ message: t('decision.prompt') })).trim();
  if (!decisionText) throw new Error('decision-required');
  const store = await targetStore(options.seed); const result = await recordDecision(store, await currentSeed(store), decisionText, options.reason, options.branch);
  if (options.json) print(result, true); else console.log(t('decision.saved', { decision: result.decision.decision, maturity: result.seed.maturity }));
}, options));

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
    sessionExitRequested = true;
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

const garden = addCommon(program.command('garden').description(t('help.garden'))).argument('[selection]', t('cli.gardenArgument'));
garden.action(async (selection: string | undefined, options: CommonOptions) => run(async () => {
  // Resolve from the nearest Seed root so `seed garden` works from any
  // nested directory inside the project, just like the other project
  // commands.
  // Garden is read-only: discover nearby projects without creating an empty
  // `.seed/` directory when the command is run from an ordinary folder.
  const entries = await gardenEntries(process.cwd());
  const value = entries.map((entry) => ({ path: entry.path, name: entry.seed.name, id: entry.seed.id, status: entry.seed.status, maturity: entry.seed.maturity, coreIdea: entry.seed.coreIdea, updatedAt: entry.seed.updatedAt, parentSeedId: entry.seed.parentSeedId }));
  if (selection) {
    const normalized = selection.trim().toLocaleLowerCase();
    const index = Number(selection) - 1;
    const selected = Number.isInteger(index) && index >= 0 ? value[index] : value.find((entry) => entry.id.toLocaleLowerCase() === normalized || entry.name.toLocaleLowerCase() === normalized || entry.path.toLocaleLowerCase() === normalized);
    if (!selected) throw new Error('seed-selection-not-found');
    if (jsonRequested(options) || !process.stdin.isTTY || options.input === false) { print(selected, jsonRequested(options)); return; }
    console.log(t('garden.opened', { name: selected.name }));
    await interactiveRepl(options, selected.path);
    return;
  }
  if (options.json) print(value, true); else { console.log(t('garden.title')); if (!value.length) console.log(t('garden.empty')); else for (const entry of value) console.log(`\n🌱 ${entry.name} (${entry.maturity}%) — ${statusLabel(entry.status)}\n   ${entry.path}\n   ${entry.coreIdea}\n   ${t('garden.updated', { date: new Date(entry.updatedAt).toLocaleString() })}`); }
}, options));

const restore = addCommon(program.command('restore').description(t('help.restore'))).argument('[item]', t('cli.restoreArgument'));
restore.action(async (item: string | undefined, options: CommonOptions) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store); const branches = (await store.branches(seed.id)).filter((branch) => branch.status === 'pruned');
  if (!item && options.json) { print({ branches, items: seed.prunedItems }, true); return; }
  if (!item && process.stdin.isTTY && options.input !== false) { const choices = [...branches.map((branch) => ({ name: `🌿 ${branch.name}`, value: branch.id })), ...seed.prunedItems.map((value) => ({ name: value, value }))]; if (!choices.length) { console.log(t('restore.empty')); return; } item = await select({ message: t('restore.choose'), choices }); }
  if (!item) throw new Error('restore-not-found');
  const updated = await restoreItem(store, seed, item); print(options.json ? updated : t('restore.done', { item }), Boolean(options.json));
}, options));

const water = addCommon(program.command('water').description(t('help.water'))).argument('[lens]', t('cli.waterArgument')).option('--answer <text>', t('cli.waterAnswerOption'));
water.action(async (lens: string | undefined, options: CommonOptions & { answer?: string }) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const perspectives = await waterPerspectives(seed, options.provider, options.model, currentLanguage());
  if (!lens && (options.json || !process.stdin.isTTY || options.input === false)) { print({ perspectives }, Boolean(options.json)); return; }
  let selected = lens ? perspectives.find((item) => item.id.toLowerCase() === lens.toLowerCase() || item.name.toLowerCase() === lens.toLowerCase()) : undefined;
  if (!selected && lens) { const index = Number(lens) - 1; if (Number.isInteger(index) && index >= 0) selected = perspectives[index]; }
  if (!selected) {
    if (lens) throw new Error('water-lens-not-found');
    console.log(t('water.title'));
    const index = await select({ message: t('water.choose'), choices: perspectives.map((item, position) => ({ name: `${position + 1}. ${item.name} — ${item.question}`, value: position })) });
    selected = perspectives[index];
  }
  if (!selected) throw new Error('water-lens-not-found');
  const insight = await waterInsight(seed, selected, options.provider, options.model, currentLanguage());
  let reflection = options.answer?.trim() ?? '';
  if (!reflection && process.stdin.isTTY && !options.json && options.input !== false) reflection = (await input({ message: t('water.followUpPrompt') })).trim();
  const followUp = reflection ? await waterInsight(seed, selected, options.provider, options.model, currentLanguage(), reflection) : undefined;
  const finalInsight = followUp ?? insight;
  const assumptionLabel = t('water.checkLabel');
  if (reflection) {
    await addConversation(store, { seedId: seed.id, role: 'user', type: 'answer', content: reflection, metadata: { lens: selected.id } });
    await addConversation(store, { seedId: seed.id, role: 'assistant', type: 'summary', content: finalInsight.summary, metadata: { lens: selected.id, source: 'water' } });
  }
  const entry: ResearchEntry = { id: randomUUID(), seedId: seed.id, source: `water:${selected.id}`, title: insight.title,
    summary: [insight.summary, ...insight.points.map((point) => `- ${point}`), ...(followUp ? [`${currentLanguage() === 'ko' ? '추가로 생각한 내용' : 'Follow-up reflection'}: ${reflection}`, followUp.summary, ...followUp.points.map((point) => `- ${point}`), ...followUp.assumptions.map((assumption) => `${assumptionLabel}: ${assumption}`)] : insight.assumptions.map((assumption) => `${assumptionLabel}: ${assumption}`))].join('\n'), relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: true };
  await store.saveResearch(entry); await addEvent(store, seed, 'water', `Watered through ${selected.name}`, { researchId: entry.id, lens: selected.id });
  if (options.json) print({ perspective: selected, insight, ...(followUp ? { followUp: { answer: reflection, insight: followUp } } : {}), research: entry }, true);
  else { console.log(`\n${finalInsight.title}\n${finalInsight.summary}`); for (const point of finalInsight.points) console.log(`\n- ${point}`); if (finalInsight.assumptions.length) { console.log(`\n${t('water.assumptions')}`); for (const assumption of finalInsight.assumptions) console.log(`  - ${assumption}`); } console.log(`\n${t('water.saved', { file: `.seed/research/${entry.id}.json` })}`); }
}, options));

const sunlight = addCommon(program.command('sunlight').description(t('help.sunlight'))).option('--web', t('cli.webOption')).option('--no-web', t('cli.noWebOption'));
sunlight.action(async (options: CommonOptions & { web?: boolean }) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const sources = options.web ? await webSources(seed.coreIdea) : [];
  const analysis = await sunlightAnalysis(seed, sources, options.provider, options.model, currentLanguage());
  // Keep facts and estimates as separate research records. A single mixed
  // record cannot faithfully represent `isEstimate`, which would otherwise
  // mark verified-looking facts as estimates (or estimates as facts).
  const researchEntries: ResearchEntry[] = analysis.areas.flatMap((area) => {
    const entries: ResearchEntry[] = [];
    if (area.findings.length) entries.push({ id: randomUUID(), seedId: seed.id, source: 'ai://sunlight', title: area.name, summary: area.findings.join('\n'), relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: true });
    if (area.facts.length) entries.push({ id: randomUUID(), seedId: seed.id, source: 'ai://sunlight/facts', title: `${area.name} — ${t('sunlight.fact')}`, summary: area.facts.join('\n'), relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: false });
    if (area.estimates.length) entries.push({ id: randomUUID(), seedId: seed.id, source: 'ai://sunlight/estimates', title: `${area.name} — ${t('sunlight.estimate')}`, summary: area.estimates.join('\n'), relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: true });
    return entries;
  });
  for (const source of sources) researchEntries.push({ id: randomUUID(), seedId: seed.id, source: source.source, title: source.title, summary: source.snippet, relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: true });
  for (const entry of researchEntries) await store.saveResearch(entry);
  const newAssumptions = analysis.assumptions.filter((assumption) => !seed.assumptions.includes(assumption));
  const newQuestions = analysis.openQuestions.filter((question) => !seed.openQuestions.some((existing) => existing.question === question)).map((question) => ({ id: randomUUID(), seedId: seed.id, question, focus: 'validation' as const, importance: 'high' as const, status: 'open' as const, createdAt: now() }));
  const updated = { ...seed, assumptions: [...seed.assumptions, ...newAssumptions], openQuestions: [...seed.openQuestions, ...newQuestions], status: seed.status === 'harvested' ? 'harvested' as const : 'evaluating' as const, updatedAt: now() };
  updated.maturityDimensions = dimensionsFor(updated, undefined, 0, currentLanguage());
  updated.maturity = calculateMaturity(updated); await store.save(updated); await addEvent(store, updated, 'sunlight', 'Sunlight reality check completed', { web: Boolean(options.web), researchCount: researchEntries.length });
  const result = { areas: analysis.areas, assumptions: analysis.assumptions, openQuestions: analysis.openQuestions, sources, maturity: updated.maturity, research: researchEntries };
  if (options.json) print(result, true);
  else { console.log(t('sunlight.title')); for (const area of analysis.areas) { console.log(`\n[${area.name}]`); for (const finding of area.findings) console.log(`- ${finding}`); for (const fact of area.facts) console.log(`- ${t('sunlight.fact')}: ${fact}`); for (const estimate of area.estimates) console.log(`- ${t('sunlight.estimate')}: ${estimate}`); } if (sources.length) console.log(`\n${t('sunlight.sources', { count: sources.length })}`); if (analysis.assumptions.length) console.log(`\n${t('sunlight.assumptions')}: ${analysis.assumptions.join('; ')}`); if (analysis.openQuestions.length) console.log(`\n${t('sunlight.questions')}: ${analysis.openQuestions.join('; ')}`); console.log(`\n${t('sunlight.saved', { count: researchEntries.length })}`); }
}, options));

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
    // As with evolve, do not append AI suggestion history until an explicit
    // selection has been checked successfully.
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
    // Pruning is intentionally reversible, so let users shape several
    // non-core items in one pass instead of forcing one prompt per branch.
    items = await checkbox({ message: t('prune.title'), choices: suggestions.map((s) => ({ name: `${s.item} — ${s.reason}`, value: s.item })) });
    if (!items.length) { console.log(t('prune.none')); return; }
  }
  let updated = seed;
  for (const selected of items) updated = await pruneItem(store, await store.load(), selected, currentLanguage());
  if (options.json) print(updated, true);
  else {
    console.log(`${t('prune.done', { item: items.join(', ') })}\n${t('prune.core')}: "${updated.coreIdea}"`);
  }
}, options));

const bloom = addCommon(program.command('bloom').description(t('help.bloom')));
bloom.action(async (options: CommonOptions) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const research = await store.research(seed.id); const evaluation = await evaluateMaturity(seed, options.provider, options.model, currentLanguage(), research); const dimensions = evaluation.dimensions;
  const updated: SeedState = { ...seed, maturityDimensions: dimensions, maturity: 0, status: seed.status };
  updated.maturity = calculateMaturity(updated);
  // A bloom review is informational after harvest; do not silently move a
  // completed seed back into an earlier lifecycle state.
  updated.status = seed.status === 'harvested' ? 'harvested' : statusForMaturity(updated.maturity);
  await store.save(updated); await addEvent(store, updated, 'bloom', `Bloom check: ${updated.maturity}%`);
  const dimensionLabel = (name: string): string => dimensions.some((dimension) => dimension.name === name) ? t(`bloom.dimension.${name}`) : name;
  const recommendationItems = evaluation.uncertain.length
    ? evaluation.uncertain
    : dimensions.filter((dimension) => dimension.score < 80).map((dimension) => dimension.name);
  const recommendation = updated.maturity < 80 && recommendationItems.length
    ? t('bloom.recommend', { items: recommendationItems.slice(0, 2).map(dimensionLabel).join(', ') })
    : '';
  const result = { maturity: updated.maturity, status: updated.status, dimensions, clear: evaluation.clear, uncertain: evaluation.uncertain, explore: evaluation.explore, recommendation, disclaimer: t('bloom.disclaimer') };
  if (options.json) print(result, true); else {
    console.log(`${t('bloom.title')}\n`); for (const d of dimensions) { const label = dimensionLabel(d.name); console.log(`${label.padEnd(18)} ${'█'.repeat(Math.round(d.score / 10))}${'░'.repeat(10 - Math.round(d.score / 10))} ${d.score}%`); }
    const exploreLabel = (item: string): string => dimensionLabel(item);
    console.log(`\n${t('bloom.overall', { maturity: updated.maturity })}`); console.log(`${t('bloom.clear')}: ${result.clear.map(dimensionLabel).join(', ') || '—'}`); console.log(`${t('bloom.uncertain')}: ${result.uncertain.map(dimensionLabel).join(', ') || '—'}`); console.log(`${t('bloom.explore')}: ${result.explore.map(exploreLabel).join('; ') || '—'}`); console.log(`\n${result.disclaimer}`);
    if (result.recommendation) console.log(result.recommendation);
  }
}, options));

const tree = addCommon(program.command('tree').description(t('help.tree'))).option('--all', t('cli.allOption'));
tree.action(async (options: CommonOptions & { all?: boolean }) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store); const branches = await store.branches(seed.id); const requestedBranch = options.branch?.trim().toLocaleLowerCase(); const visible = (options.all ? branches : branches.filter((b) => b.status === 'active')).filter((branch) => !requestedBranch || branch.id.toLocaleLowerCase() === requestedBranch);
  if (options.branch && !visible.length) throw new Error('branch-selection-not-found');
  const value = { name: seed.name, coreIdea: seed.coreIdea, status: seed.status, maturity: seed.maturity, activeBranch: seed.activeBranch, branches: visible };
  if (options.json) print(value, true); else { console.log(`${t('tree.title')}\n\n🌱 ${seed.name} (${seed.maturity}%)\n│\n├── ${seed.coreIdea}`); for (const b of visible) console.log(`\n├── ${b.status === 'active' ? '🌿' : '✂️'} ${b.name}${b.id === seed.activeBranch ? ' ⭐' : ''}\n│   ${b.summary}`); }
}, options));

const history = addCommon(program.command('history').description(t('help.history'))).option('--limit <n>', t('cli.limitOption'), '50');
history.action(async (options: CommonOptions & { limit: string }) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store);
  const limit = Number(options.limit); if (!Number.isInteger(limit) || limit < 1) throw new Error('invalid-limit');
  const since = options.since ? Date.parse(options.since) : undefined; if (options.since && !Number.isFinite(since)) throw new Error('invalid-since');
  let events = await store.events(seed.id); if (since !== undefined) events = events.filter((event) => Date.parse(event.createdAt) >= since); events = events.slice(-limit);
  if (options.json) print(events, true); else { console.log(t('history.title')); if (!events.length) console.log(t('history.empty')); else for (const event of events) console.log(`${new Date(event.createdAt).toLocaleString()}  ${t(`history.type.${event.type}`)}  ${historyMessage(event)}`); }
}, options));

const harvestCommand = addCommon(program.command('harvest').description(t('help.harvest'))).argument('[type]', t('cli.harvestArgument'));
harvestCommand.action(async (type: HarvestType | 'all' | undefined, options: CommonOptions) => run(async () => {
  const store = await targetStore(options.seed); const seed = await currentSeed(store);
  if (!type && process.stdin.isTTY && options.input !== false && !jsonRequested(options)) {
    const choices = ['idea', 'brief', 'prd', 'trd', 'readme', 'prompt', 'all'] as const;
    type = await select({ message: t('harvest.select'), choices: choices.map((value) => ({ name: harvestTitle(value, currentLanguage()), value })) });
  }
  type ??= 'idea';
  if (!['idea', 'brief', 'prd', 'trd', 'readme', 'prompt', 'all'].includes(type)) throw new Error('invalid-harvest');
  const file = await harvest(store, seed, type, currentLanguage());
  print(options.json ? { type, file } : t('harvest.saved', { type: harvestTitle(type, currentLanguage()), file: Array.isArray(file) ? file.join(', ') : file }), Boolean(options.json));
}, options));

const config = program.command('config').description(t('help.config')).option('--lang <lang>', t('cli.langOption')).option('--json', t('cli.jsonOption')).option('--no-input', t('cli.noInputOption'));
function configFailure(options: CommonOptions, message: string, code: string): void {
  if (jsonRequested(options)) print({ error: code, message }, true);
  else console.log(message);
  process.exitCode = 1;
}
function credentialEnvName(provider: ProviderConfig): string {
  if (provider.type === 'openai') return 'OPENAI_API_KEY';
  if (provider.type === 'gemini') return 'GEMINI_API_KEY';
  if (provider.type === 'anthropic') return 'ANTHROPIC_API_KEY';
  const suffix = provider.id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return `SEED_${suffix}_API_KEY`;
}
function missingCredentialMessage(provider: ProviderConfig): string {
  return provider.type === 'openai' && provider.connectionMode === 'oauth'
    ? t('config.oauthMissing')
    : t('config.emptyKey', { env: credentialEnvName(provider) });
}
async function configuredCredential(provider: ProviderConfig): Promise<string | undefined> {
  if (provider.type === 'openai' && provider.connectionMode === 'oauth') return getOpenAIToken();
  return providerKey(provider);
}
async function configWizard(): Promise<void> {
  const current = await loadConfig();
  current.lang = currentLanguage();
  current.setupCompleted = true;
  const selected = await select({ message: t('config.chooseProvider'), choices: [
    { name: t('config.provider.openaiKey'), value: 'openai' },
    { name: t('config.provider.openaiAccount'), value: 'openai-oauth' },
    { name: t('config.provider.gemini'), value: 'gemini' },
    { name: t('config.provider.anthropic'), value: 'anthropic' },
    { name: t('config.provider.custom'), value: 'custom' },
    { name: t('config.provider.local'), value: 'local' },
  ] });
  if (selected === 'local') { current.activeProvider = 'local'; await persistConfig(current); console.log(t('config.saved')); return; }
  if (selected === 'openai-oauth') {
    console.log(t('config.oauthExperimental'));
    try {
      const configuredModel = process.env.SEED_OPENAI_OAUTH_MODEL?.trim();
      const defaultOAuthModel = configuredModel === 'gpt-5.3-codex' ? DEFAULT_OPENAI_OAUTH_MODEL : configuredModel || DEFAULT_OPENAI_OAUTH_MODEL;
      const enteredModel = (await input({ message: t('config.model'), default: defaultOAuthModel })).trim();
      const oauthModel = enteredModel === 'gpt-5.3-codex' ? DEFAULT_OPENAI_OAUTH_MODEL : enteredModel || defaultOAuthModel;
      await loginOpenAI(currentLanguage());
      const existing = current.providers.find((provider) => provider.id === 'openai');
      const oauthProvider = {
        ...(existing ?? { id: 'openai', name: 'openai', type: 'openai' as const, defaultModel: oauthModel, enabled: true }),
        enabled: true,
        defaultModel: oauthModel,
        connectionMode: 'oauth' as const,
      };
      await testProviderConnection(oauthProvider, currentLanguage());
      current.providers = [...current.providers.filter((entry) => entry.id !== 'openai'), oauthProvider];
      current.activeProvider = 'openai';
      await persistConfig(current);
      console.log(t('config.saved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(t('config.oauthFailed', { message }));
      current.activeProvider = 'local';
      await persistConfig(current);
    }
    return;
  }
  const id = selected === 'custom' ? (await input({ message: t('config.providerId'), default: 'custom-1' })).trim() || 'custom-1' : selected;
  const baseUrl = selected === 'custom' ? (await input({ message: t('config.baseUrl') })).trim() : undefined;
  if (selected === 'custom' && !baseUrl) {
    console.log(t('config.baseUrlRequired'));
    current.activeProvider = 'local'; await persistConfig(current); return;
  }
  const modelDefaults: Record<string, string> = { openai: DEFAULT_OPENAI_MODEL, gemini: 'gemini-2.5-flash', anthropic: 'claude-3-5-sonnet-latest' };
  const enteredModel = (await input({ message: t('config.model'), ...(modelDefaults[selected] ? { default: modelDefaults[selected] } : {}) })).trim();
  if (selected === 'custom' && !enteredModel) {
    console.log(t('config.modelRequired'));
    current.activeProvider = 'local'; await persistConfig(current); return;
  }
  const defaultModel = enteredModel || modelDefaults[selected] || 'default';
  const existing = current.providers.find((provider) => provider.id === id);
  const provider = { id, name: id, type: (selected === 'custom' ? 'custom' : selected) as 'openai' | 'gemini' | 'anthropic' | 'custom', defaultModel, enabled: true, ...(baseUrl ? { baseUrl } : {}), connectionMode: 'api-key' as const };
  const key = providerKey(provider);
  if (!key) {
    // A provider profile is only persisted after its connection test passes.
    // Keep the local fallback active so first-run setup never leaves a
    // half-configured provider that looks ready in `config list`.
    current.activeProvider = 'local';
    await persistConfig(current);
    console.log(t('config.emptyKey', { env: credentialEnvName(provider) }));
    return;
  }
  try { await testProviderConnection(provider, currentLanguage(), key); }
  catch (error) {
    console.log(t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }));
    current.activeProvider = 'local'; await persistConfig(current); return;
  }
  current.providers = [...current.providers.filter((entry) => entry.id !== id), provider]; current.activeProvider = id; await persistConfig(current); console.log(t('config.saved'));
}
/** Persist settings locally when running inside a Seed project. */
async function persistConfig(config: Awaited<ReturnType<typeof loadConfig>>): Promise<void> {
  const savedToProject = await saveProjectConfig(config);
  if (!savedToProject) await saveConfig(config);
}
config.action(async (options: CommonOptions) => run(async () => { if (process.stdin.isTTY && options.input !== false && !jsonRequested(options)) await configWizard(); else { const value = await loadConfig(); print({ ...value, envKeys: ['OPENAI_API_KEY', 'SEED_GEMINI_API_KEY', 'GEMINI_API_KEY', 'SEED_ANTHROPIC_API_KEY', 'SEED_API_KEY'] }, jsonRequested(options)); } }, options));
config.command('list').description(t('cli.configList')).action(async (options: CommonOptions) => run(async () => { const value = await loadConfig(); print(value, jsonRequested(options)); }, options));
config.command('use').argument('<provider>').description(t('cli.configUse')).action(async (provider: string, options: CommonOptions) => run(async () => {
  const value = await loadConfig(); const selected = value.providers.find((entry) => entry.id === provider);
  if (!selected) throw new Error(t('error.invalidProvider', { provider }));
  if (selected.id !== 'local') {
    const credential = await configuredCredential(selected);
    if (!credential) { configFailure(options, missingCredentialMessage(selected), 'provider-credential-missing'); return; }
    try { await testProviderConnection(selected, currentLanguage(), credential); }
    catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
  }
  selected.enabled = true;
  value.activeProvider = provider; await persistConfig(value); print(jsonRequested(options) ? { activeProvider: provider } : t('config.active', { provider }), jsonRequested(options));
}, options));
config.command('set').argument('<key>').argument('<value>').description(t('cli.configSet')).action(async (key: string, valueArg: string, options: CommonOptions) => run(async () => {
  const value = await loadConfig();
  if (key === 'lang') { if (valueArg !== 'ko' && valueArg !== 'en') throw new Error('invalid-language'); value.lang = valueArg; setLanguage(valueArg); await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return; }
  if (key === 'provider') {
    if (!value.providers.some((p) => p.id === valueArg)) {
      const known = valueArg === 'openai' ? { type: 'openai' as const, model: DEFAULT_OPENAI_MODEL } : valueArg === 'gemini' ? { type: 'gemini' as const, model: 'gemini-2.5-flash' } : valueArg === 'anthropic' ? { type: 'anthropic' as const, model: 'claude-3-5-sonnet-latest' } : { type: 'custom' as const, model: 'default' };
      value.providers.push({ id: valueArg, name: valueArg, type: known.type, defaultModel: known.model, enabled: true, ...(known.type === 'openai' ? { connectionMode: 'api-key' as const } : {}) });
    }
    const configured = value.providers.find((provider) => provider.id === valueArg);
    // `config set provider openai` is the explicit way to switch an existing
    // account profile back to API-key mode. Prefer an available API key here;
    // otherwise preserve OAuth and read its local account credential.
    const apiKey = configured?.type === 'openai' ? providerKey(configured) : undefined;
    const credential = configured ? apiKey ?? await configuredCredential(configured) : undefined;
    if (configured && configured.id !== 'local' && !credential) { configFailure(options, missingCredentialMessage(configured), 'provider-credential-missing'); return; }
    if (configured && configured.id !== 'local') {
      const testConfig = apiKey && configured.type === 'openai' ? { ...configured, connectionMode: 'api-key' as const } : configured;
      try { await testProviderConnection(testConfig, currentLanguage(), credential); }
      catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
    }
    if (configured) {
      configured.enabled = true;
      if (configured.type === 'openai' && apiKey) configured.connectionMode = 'api-key';
    }
    value.activeProvider = valueArg; await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return;
  }
  if (key === 'model' || key === 'baseUrl') {
    if (!valueArg.trim()) throw new Error(key === 'baseUrl' ? 'base-url-required' : 'invalid-model-setting');
    const active = value.providers.find((p) => p.id === value.activeProvider);
    if (!active) throw new Error(t('error.invalidProvider', { provider: value.activeProvider }));
    const candidate = key === 'model' ? { ...active, defaultModel: valueArg } : { ...active, baseUrl: valueArg };
    if (candidate.id !== 'local') {
      const credential = await configuredCredential(candidate);
      if (!credential) { configFailure(options, missingCredentialMessage(candidate), 'provider-credential-missing'); return; }
      try { await testProviderConnection(candidate, currentLanguage(), credential); }
      catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
    }
    Object.assign(active, candidate); await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return;
  }
  if (key === 'temperature' || key === 'maxTokens') {
    const number = Number(valueArg);
    const valid = Number.isFinite(number) && (key === 'temperature' ? number >= 0 && number <= 2 : Number.isInteger(number) && number > 0 && number <= 200_000);
    if (!valid) throw new Error('invalid-model-setting');
    const active = value.providers.find((p) => p.id === value.activeProvider);
    if (!active) throw new Error(t('error.invalidProvider', { provider: value.activeProvider }));
    const candidate = { ...active, [key]: number };
    if (candidate.id !== 'local') {
      const credential = await configuredCredential(candidate);
      if (!credential) { configFailure(options, missingCredentialMessage(candidate), 'provider-credential-missing'); return; }
      try { await testProviderConnection(candidate, currentLanguage(), credential); }
      catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); return; }
    }
    Object.assign(active, candidate); await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options)); return;
  }
  throw new Error(t('error.unknownConfigKey', { key }));
}));
config.command('unset').argument('<key>').description(t('cli.configUnset')).action(async (key: string, options: CommonOptions) => run(async () => {
  const value = await loadConfig();
  if (key === 'lang') delete value.lang;
  else throw new Error(t('error.unknownConfigKey', { key }));
  await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options));
}, options));
config.command('test').description(t('cli.configTest')).action(async (options: CommonOptions) => run(async () => {
  const value = await loadConfig(); const active = value.providers.find((p) => p.id === value.activeProvider);
  if (!active || active.id === 'local') { print(jsonRequested(options) ? { success: true, provider: 'local' } : t('config.localReady'), jsonRequested(options)); return; }
  const key = await configuredCredential(active);
  if (!key) { configFailure(options, missingCredentialMessage(active), 'provider-credential-missing'); return; }
  try { await testProviderConnection(active, currentLanguage(), key); print(jsonRequested(options) ? { success: true, provider: active.id } : t('config.keyConfigured', { provider: active.id }), jsonRequested(options)); }
  catch (error) { configFailure(options, t('config.connectionFailed', { message: error instanceof Error ? error.message : String(error) }), 'provider-connection-failed'); }
}, options));
config.command('bench').description(t('cli.configBench')).option('--prompt <text>', t('cli.benchPromptOption')).option('--json', t('cli.jsonOption')).action(async (options: { prompt?: string; json?: boolean }) => run(async () => {
  const value = await loadConfig();
  const results: Array<{ provider: string; model: string; status: 'ok' | 'missing' | 'failed'; latencyMs?: number; error?: string }> = [];
  for (const candidate of value.providers.filter((provider) => provider.enabled !== false)) {
    const credential = await configuredCredential(candidate);
    if (candidate.id !== 'local' && !credential) { results.push({ provider: candidate.id, model: candidate.defaultModel, status: 'missing' }); continue; }
    const started = Date.now();
    try {
      const provider = await getProvider(candidate.id, candidate.defaultModel, currentLanguage());
      const response = await provider.ask(options.prompt?.trim() || 'Reply with the single word OK.');
      if (!response.trim()) throw new Error(t('error.providerEmptyResponse'));
      results.push({ provider: candidate.id, model: provider.model, status: 'ok', latencyMs: Date.now() - started });
    } catch (error) {
      results.push({ provider: candidate.id, model: candidate.defaultModel, status: 'failed', latencyMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (jsonRequested(options)) print(results, true);
  else { console.log(t('config.benchTitle')); for (const result of results) console.log(`${result.provider} (${result.model}): ${t(`config.benchStatus.${result.status}`)}${result.latencyMs === undefined ? '' : ` — ${result.latencyMs}ms`}${result.error ? ` — ${result.error}` : ''}`); }
}, options));
config.command('login').argument('<provider>').description(t('cli.configLogin')).action(async (provider: string, options: CommonOptions) => run(async () => {
  if (provider !== 'openai') throw new Error(t('error.onlyOpenAIAccount'));
  await loginOpenAI(currentLanguage(), jsonRequested(options)); const value = await loadConfig(); const existing = value.providers.find((entry) => entry.id === 'openai');
  const configuredModel = process.env.SEED_OPENAI_OAUTH_MODEL?.trim();
  const defaultModel = configuredModel && configuredModel !== 'gpt-5.3-codex'
    ? configuredModel
    : existing?.connectionMode === 'oauth' && existing.defaultModel && existing.defaultModel !== 'gpt-5.3-codex'
      ? existing.defaultModel : DEFAULT_OPENAI_OAUTH_MODEL;
  const openai = { ...(existing ?? { id: 'openai', name: 'openai', type: 'openai' as const, enabled: true }), enabled: true, defaultModel, connectionMode: 'oauth' as const };
  await testProviderConnection(openai, currentLanguage());
  value.providers = [...value.providers.filter((entry) => entry.id !== 'openai'), openai]; value.activeProvider = 'openai'; await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options));
}, options));
config.command('remove').argument('<provider>').description(t('cli.configRemove')).action(async (provider: string, options: CommonOptions) => run(async () => {
  if (provider === 'local') { configFailure(options, t('config.localProtected'), 'local-provider-protected'); return; }
  const value = await loadConfig();
  if (!value.providers.some((entry) => entry.id === provider)) throw new Error(`provider-not-configured:${provider}`);
  value.providers = value.providers.filter((p) => p.id !== provider); if (value.activeProvider === provider) value.activeProvider = 'local'; await persistConfig(value); print(jsonRequested(options) ? value : t('config.saved'), jsonRequested(options));
}, options));

const logoOutput = chalk.green(`${SEED_LOGO}\n`);
if (hasFlag('--json')) console.error(logoOutput);
else console.log(logoOutput);
program.parseAsync(process.argv);
