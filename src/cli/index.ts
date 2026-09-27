#!/usr/bin/env node
import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SeedState } from '../domain.js';
import { initializeLanguage, t, currentLanguage, setLanguage } from '../i18n/index.js';
import { openStore, SeedStore, loadConfig } from '../storage/store.js';
import { plant } from '../core/seed-manager.js';
import { askGrowthQuestion } from '../core/growth.js';
import { getProvider } from '../ai/provider.js';
import { configWizard } from './config-setup.js';
import { registerConfigCommands } from './config-commands.js';
import { createGrowthWorkspace } from './growth-workspace.js';
import { registerGrowCommand } from './grow-command.js';
import { registerShapeCommands } from './shape-commands.js';
import { interactiveGrowthSession, printGrowthQuestion, printGrowthSignals } from './growth-session.js';
import type { CommonOptions } from './config-commands.js';
import { registerSunlightCommand } from './sunlight-command.js';
import { registerHarvestCommand } from './harvest-command.js';
import { registerLifecycleCommands } from './lifecycle-commands.js';
import { registerWaterCommand } from './water-command.js';
import { registerBloomCommand } from './bloom-command.js';
import { registerEvolveCommand } from './evolve-command.js';
import { registerDecisionCommand } from './decision-command.js';
import { registerProjectCommands } from './project-commands.js';
import { gardenEntries } from '../core/garden.js';
import { findSeedRoot } from '../utils/path.js';
import { logoOutput } from './terminal.js';

const hasFlag = (name: string): boolean => process.argv.some((argument) => argument === name || argument.startsWith(`${name}=`));
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
program.name('seed').description(t('help.description')).version('0.1.1', '-V, --version', t('cli.versionOption')).helpOption('-h, --help', t('cli.helpOption'))
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
    else if (message === 'ai-provider-required') console.error(t('error.aiProviderRequired'));
    else if (message === 'ai-provider-unavailable') console.error(t('error.aiProviderUnavailable'));
    else if (message === 'ai-response-invalid') console.error(t('error.aiResponseInvalid'));
    else if (message.startsWith('ai-connection-failed:')) console.error(t('error.aiConnectionFailed', { message: message.slice('ai-connection-failed:'.length) }));
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
    else if (/request (failed \(\d)/i.test(message)) console.error(t('error.aiRequestFailed', { message }));
    else if (/request (timed out)|fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(message)) console.error(t('error.aiConnectionFailed', { message }));
    else console.error(t('error.generic', { message }));
    process.exitCode = 1;
  });
}
async function currentSeed(store: SeedStore): Promise<SeedState> {
  if (!(await store.hasSeed())) throw new Error('no-seed');
  return store.load();
}
// The workspace tracks nested garden roots and conversational exit state.
const workspace = createGrowthWorkspace({ program, currentSeed, printGrowthQuestion });
async function targetStore(selector?: string): Promise<SeedStore> {
  // Read-only commands must not create `.seed/` in an ordinary directory.
  // Planting remains the sole entry point that intentionally creates a root.
  const currentRoot = workspace.rootOverride ?? await findSeedRoot() ?? path.resolve(process.cwd());
  const current = new SeedStore(currentRoot);
  const entries = await gardenEntries(current.root);
  if (!selector) {
    if (entries.length <= 1) return entries[0] ? new SeedStore(entries[0].path) : current;
    // Interactive commands choose a Seed when a garden contains more than
    // one project. JSON/non-interactive callers keep the nearest project as
    // a deterministic default and can opt into another with --seed.
    if (process.stdin.isTTY && !hasFlag('--json') && !process.argv.includes('--no-input')) {
      const selected = await select({ message: t('garden.choose'), choices: entries.map((entry) => ({ name: `${entry.seed.name} (${entry.seed.maturity}%) ??${statusLabel(entry.seed.status)}`, value: entry.path })) });
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
const jsonRequested = (options?: CommonOptions): boolean => Boolean(options?.json || hasFlag('--json'));

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
      await interactiveGrowthSession(workspace, store, existing, options, undefined, true);
      if (!workspace.exitRequested) await workspace.interactiveRepl(options);
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
  // Fail before writing .seed/ so a missing/unreachable AI provider never
  // leaves a half-created project that then blocks a retry with
  // "seed-exists". This calls getProvider with no explicit id when the
  // user did not pass --provider, matching what askGrowthQuestion will use.
  await getProvider(options.provider, options.model, currentLanguage());
  let seed = await plant(store, idea);
  let question = await askGrowthQuestion(store, seed, options.provider, undefined, options.model, currentLanguage());
  seed = await store.load();
  if (options.json) { print({ ...(await store.load()), firstQuestion: question }, true); } else {
    console.log(`${t('plant.created')}\n${t('plant.growNext')}`);
    if (!process.stdin.isTTY || options.input === false) { console.log(`\n${question}`); return; }
    await interactiveGrowthSession(workspace, store, seed, options, question);
    if (!workspace.exitRequested) await workspace.interactiveRepl(options);
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
  console.log(t('setup.complete'));
}

registerGrowCommand(program, { addCommon, run, targetStore, currentSeed, print, workspace });

registerEvolveCommand(program, { addCommon, run, targetStore, currentSeed, print });
registerDecisionCommand(program, { addCommon, run, targetStore, currentSeed, print });

registerLifecycleCommands(program, { addCommon, run, targetStore, currentSeed, print, workspace });

registerProjectCommands(program, { addCommon, run, targetStore, currentSeed, jsonRequested, print, statusLabel, workspace });

registerWaterCommand(program, { addCommon, run, targetStore, currentSeed, print });

registerSunlightCommand(program, { addCommon, run, targetStore, currentSeed, print });

registerShapeCommands(program, { addCommon, run, targetStore, currentSeed, print });

registerBloomCommand(program, { addCommon, run, targetStore, currentSeed, print });

registerHarvestCommand(program, { addCommon, run, targetStore, currentSeed, jsonRequested, print });


registerConfigCommands(program, { run, jsonRequested, print });

if (hasFlag('--json')) console.error(logoOutput);
else console.log(logoOutput);
program.parseAsync(process.argv);
