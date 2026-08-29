#!/usr/bin/env node
import { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Branch, HarvestType, SeedState } from '../domain.js';
import { initializeLanguage, t, currentLanguage, setLanguage } from '../i18n/index.js';
import { openStore, SeedStore, loadConfig, saveConfig } from '../storage/store.js';
import { plant, addEvent } from '../core/seed-manager.js';
import { askGrowthQuestion, applyGrowth } from '../core/growth.js';
import { branchSuggestions, createBranch, pruneItem, pruneSuggestions } from '../core/branch.js';
import { calculateMaturity, clearItems, uncertainItems, exploreItems, statusForMaturity } from '../core/maturity.js';
import { dimensionsFor } from '../ai/provider.js';
import { harvest, harvestTitle } from '../core/harvest.js';

type CommonOptions = { lang?: string; json?: boolean; provider?: string; model?: string; branch?: string };
const startupLang = process.argv.includes('--lang') && process.argv[process.argv.indexOf('--lang') + 1] ? process.argv[process.argv.indexOf('--lang') + 1] : process.env.SEED_LANG;
setLanguage(startupLang);
const program = new Command();
program.name('seed').description(t('help.description')).version('0.1.0')
  .argument('[idea]', 'Plant a new idea directly').option('--lang <lang>', 'UI language (en or ko)').option('--json', 'JSON output')
  .action(async (idea: string | undefined, options: CommonOptions) => run(() => plantCommand(idea, options), options));

function addCommon(command: Command): Command {
  return command.option('--lang <lang>', 'UI language (en or ko)').option('--json', 'JSON output').option('--provider <id>', 'AI provider override').option('--branch <id>', 'Branch to use');
}
function run(action: () => Promise<void>, options: CommonOptions = {}): Promise<void> {
  // Commander keeps duplicate global options on the parent command when a
  // subcommand is used. Merge them back so `seed tree --json` behaves like
  // every other command.
  Object.assign(options, { ...program.opts(), ...options });
  return initializeLanguage(options.lang).then(action).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) { console.error(JSON.stringify({ error: message })); process.exitCode = 1; return; }
    if (message === 'no-seed') console.error(t('error.noSeed'));
    else if (message === 'seed-exists') console.error(t('error.seedExists'));
    else if (message === 'idea-required') console.error(t('error.ideaRequired'));
    else if (message === 'too-many-branches') console.error(t('branch.tooMany'));
    else console.error(t('error.generic', { message }));
    process.exitCode = 1;
  });
}
async function currentSeed(store: SeedStore): Promise<SeedState> {
  if (!(await store.hasSeed())) throw new Error('no-seed');
  return store.load();
}
function print(value: unknown, json = false): void { if (json) console.log(JSON.stringify(value, null, 2)); else console.log(value); }

async function plantCommand(idea: string | undefined, options: CommonOptions): Promise<void> {
  const store = await openStore();
  if (await store.hasSeed()) throw new Error('seed-exists');
  if (!idea) {
    if (!process.stdin.isTTY) throw new Error('An idea is required in non-interactive mode.');
    console.log(`${t('welcome.title')}\n${t('welcome.subtitle')}`); idea = (await input({ message: t('welcome.prompt') })).trim();
  }
  if (!idea) throw new Error('An idea is required.');
  const seed = await plant(store, idea);
  const question = await askGrowthQuestion(store, seed, options.provider, undefined, options.model);
  if (options.json) { print({ ...(await store.load()), firstQuestion: question }, true); } else {
    console.log(`${t('plant.created')}\n${t('plant.growNext')}`);
    console.log(`\n${question}`);
  }
}

const grow = addCommon(program.command('grow').description(t('help.grow'))).option('--answer <text>', 'Non-interactive answer').option('--no-interactive', 'Do not prompt for an answer');
grow.action(async (options: CommonOptions & { answer?: string; interactive?: boolean }) => run(async () => {
  const store = await openStore(); let seed = await currentSeed(store);
  const branchId = options.branch ?? seed.activeBranch;
  let answer = options.answer;
  if (!answer) {
    const question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model);
    if (options.interactive === false || !process.stdin.isTTY) { print({ question }, Boolean(options.json)); return; }
    answer = await input({ message: question });
  }
  if (!answer?.trim()) throw new Error(t('grow.answerRequired'));
  const result = await applyGrowth(store, seed, answer, options.provider, branchId);
  seed = result.seed;
  if (options.json) print({ before: result.before, after: result.after, maturity: seed.maturity, status: seed.status }, true);
  else { console.log(`${t('grow.update')}\n${t('grow.before')}: "${result.before}"\n${t('grow.now')}:    "${result.after}"\n\n${t('grow.saved', { maturity: seed.maturity })}`); if (result.after.length > 180) console.log(`\n${t('grow.pruneHint')}`); }
}, options));

const branch = addCommon(program.command('branch').description(t('help.branch'))).argument('[selection]', 'index, name, or list');
branch.action(async (selection: string | undefined, options: CommonOptions) => run(async () => {
  const store = await openStore(); const seed = await currentSeed(store); const branches = await store.branches(seed.id);
  if (selection === 'list') { if (!branches.length) print(t('branch.listEmpty')); else print(options.json ? branches : branches.map((b) => `${b.status === 'active' ? '🌿' : '✂️'} ${b.name} (${b.maturity}%)`).join('\n'), Boolean(options.json)); return; }
  if (selection) {
    const suggestions = await branchSuggestions(seed, options.provider, options.model); const index = Number(selection) - 1;
    const selected = Number.isInteger(index) && index >= 0 ? suggestions[index] : suggestions.find((s) => s.name.toLowerCase() === selection.toLowerCase());
    if (!selected) throw new Error('Branch selection not found.');
    const created = await createBranch(store, seed, selected.name, selected.summary, options.provider);
    print(options.json ? created : t('branch.created', { name: created.name }), Boolean(options.json)); return;
  }
  const suggestions = await branchSuggestions(seed, options.provider, options.model);
  if (options.json || !process.stdin.isTTY) { print({ suggestions }, Boolean(options.json)); return; }
  console.log(t('branch.title'));
  const selected = await select({ message: t('branch.select', { count: suggestions.length }), choices: suggestions.map((s, i) => ({ name: `${i + 1}. ${s.name} — ${s.summary}`, value: i })) });
  const choice = suggestions[selected]; if (!choice) throw new Error('Branch selection not found.');
  const created = await createBranch(store, seed, choice.name, choice.summary, options.provider); console.log(t('branch.created', { name: created.name }));
}, options));

const prune = addCommon(program.command('prune').description(t('help.prune'))).argument('[item]', 'Item or branch to prune');
prune.action(async (item: string | undefined, options: CommonOptions) => run(async () => {
  const store = await openStore(); const seed = await currentSeed(store); const suggestions = await pruneSuggestions(seed, options.provider, options.model);
  item ??= options.branch;
  if (!item) {
    if (options.json || !process.stdin.isTTY) { print({ suggestions }, Boolean(options.json)); return; }
    if (!suggestions.length) { console.log(t('prune.none')); return; }
    const selected = await select({ message: t('prune.title'), choices: suggestions.map((s) => ({ name: `${s.item} — ${s.reason}`, value: s.item })) }); item = selected;
  }
  const updated = await pruneItem(store, seed, item); print(options.json ? updated : t('prune.done', { item }), Boolean(options.json));
}, options));

const bloom = addCommon(program.command('bloom').description(t('help.bloom')));
bloom.action(async (options: CommonOptions) => run(async () => {
  const store = await openStore(); const seed = await currentSeed(store); const dimensions = dimensionsFor(seed);
  const updated = { ...seed, maturityDimensions: dimensions, maturity: 0, status: seed.status };
  updated.maturity = calculateMaturity(updated); updated.status = statusForMaturity(updated.maturity); await store.save(updated); await addEvent(store, updated, 'bloom', `Bloom check: ${updated.maturity}%`);
  const result = { maturity: updated.maturity, status: updated.status, dimensions, clear: clearItems(updated), uncertain: uncertainItems(updated), explore: exploreItems(updated), disclaimer: t('bloom.disclaimer') };
  if (options.json) print(result, true); else {
    console.log(`${t('bloom.title')}\n`); for (const d of dimensions) console.log(`${d.name.padEnd(18)} ${'█'.repeat(Math.round(d.score / 10))}${'░'.repeat(10 - Math.round(d.score / 10))} ${d.score}%`);
    console.log(`\n${t('bloom.overall', { maturity: updated.maturity })}`); console.log(`${t('bloom.clear')}: ${result.clear.join(', ') || '—'}`); console.log(`${t('bloom.uncertain')}: ${result.uncertain.join(', ') || '—'}`); console.log(`${t('bloom.explore')}: ${result.explore.join('; ') || '—'}`); console.log(`\n${result.disclaimer}`);
    if (updated.maturity < 80 && result.uncertain.length) console.log(t('bloom.recommend', { items: result.uncertain.slice(0, 2).join(', ') }));
  }
}, options));

const tree = addCommon(program.command('tree').description(t('help.tree'))).option('--all', 'Include pruned branches');
tree.action(async (options: CommonOptions & { all?: boolean }) => run(async () => {
  const store = await openStore(); const seed = await currentSeed(store); const branches = await store.branches(seed.id); const visible = options.all ? branches : branches.filter((b) => b.status === 'active');
  const value = { name: seed.name, coreIdea: seed.coreIdea, status: seed.status, maturity: seed.maturity, activeBranch: seed.activeBranch, branches: visible };
  if (options.json) print(value, true); else { console.log(`${t('tree.title')}\n\n🌱 ${seed.name} (${seed.maturity}%)\n│\n├── ${seed.coreIdea}`); for (const b of visible) console.log(`\n├── ${b.status === 'active' ? '🌿' : '✂️'} ${b.name}${b.id === seed.activeBranch ? ' ⭐' : ''}\n│   ${b.summary}`); }
}, options));

const history = addCommon(program.command('history').description(t('help.history'))).option('--limit <n>', 'Maximum events', '50');
history.action(async (options: CommonOptions & { limit: string }) => run(async () => {
  const store = await openStore(); const seed = await currentSeed(store); const events = (await store.events(seed.id)).slice(-Number(options.limit));
  if (options.json) print(events, true); else { console.log(t('history.title')); if (!events.length) console.log(t('history.empty')); else for (const event of events) console.log(`${new Date(event.createdAt).toLocaleString()}  ${event.message}`); }
}, options));

const harvestCommand = addCommon(program.command('harvest').description(t('help.harvest'))).argument('[type]', 'idea, brief, prd, trd, readme, prompt, or all');
harvestCommand.action(async (type: HarvestType | 'all' | undefined, options: CommonOptions) => run(async () => {
  const store = await openStore(); const seed = await currentSeed(store);
  if (!type && process.stdin.isTTY) type = await select({ message: t('harvest.select'), choices: ['idea', 'brief', 'prd', 'trd', 'readme', 'prompt', 'all'] });
  type ??= 'idea';
  if (!['idea', 'brief', 'prd', 'trd', 'readme', 'prompt', 'all'].includes(type)) throw new Error(t('harvest.invalid'));
  const file = await harvest(store, seed, type, currentLanguage());
  print(options.json ? { type, file } : t('harvest.saved', { type: harvestTitle(type), file: Array.isArray(file) ? file.join(', ') : file }), Boolean(options.json));
}, options));

const config = program.command('config').description(t('help.config')).option('--lang <lang>', 'UI language (en or ko)');
async function configWizard(): Promise<void> {
  const current = await loadConfig();
  const selected = await select({ message: t('config.chooseProvider'), choices: [
    { name: 'Local fallback — no API key', value: 'local' },
    { name: 'OpenAI — API key', value: 'openai' },
    { name: 'Google Gemini — API key', value: 'gemini' },
    { name: 'Anthropic Claude — API key', value: 'anthropic' },
    { name: 'Custom OpenAI-compatible provider', value: 'custom' },
  ] });
  if (selected === 'local') { current.activeProvider = 'local'; await saveConfig(current); console.log(t('config.saved')); return; }
  const id = selected === 'custom' ? (await input({ message: t('config.providerId'), default: 'custom-1' })).trim() : selected;
  const baseUrl = selected === 'custom' ? (await input({ message: t('config.baseUrl') })).trim() : undefined;
  const modelDefaults: Record<string, string> = { openai: 'gpt-4o-mini', gemini: 'gemini-2.5-flash', anthropic: 'claude-3-5-sonnet-latest' };
  const defaultModel = await input({ message: t('config.model'), default: modelDefaults[selected] ?? 'default' });
  const existing = current.providers.find((provider) => provider.id === id);
  const provider = { id, name: id, type: (selected === 'custom' ? 'custom' : selected) as 'openai' | 'gemini' | 'anthropic' | 'custom', defaultModel, enabled: true, ...(baseUrl ? { baseUrl } : {}), ...(existing?.connectionMode ? { connectionMode: existing.connectionMode } : {}) };
  const key = selected === 'openai' ? (process.env.SEED_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY) : selected === 'gemini' ? process.env.SEED_GEMINI_API_KEY : selected === 'anthropic' ? (process.env.SEED_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY) : process.env.SEED_API_KEY;
  if (!key) { console.log(t('config.emptyKey')); return; }
  current.providers = [...current.providers.filter((entry) => entry.id !== id), provider]; current.activeProvider = id; await saveConfig(current); console.log(t('config.saved'));
}
config.action(async (options: CommonOptions) => run(async () => { if (process.stdin.isTTY) await configWizard(); else { const value = await loadConfig(); console.log(JSON.stringify({ ...value, envKeys: ['OPENAI_API_KEY', 'SEED_GEMINI_API_KEY', 'SEED_ANTHROPIC_API_KEY', 'SEED_API_KEY'] }, null, 2)); } }, options));
config.command('list').description('List providers').action(async () => run(async () => { const value = await loadConfig(); console.log(JSON.stringify(value, null, 2)); }));
config.command('use').argument('<provider>').description('Select active provider').action(async (provider: string) => run(async () => { const value = await loadConfig(); if (!value.providers.some((p) => p.id === provider)) throw new Error(t('error.invalidProvider', { provider })); value.activeProvider = provider; await saveConfig(value); console.log(t('config.active', { provider })); }));
config.command('set').argument('<key>').argument('<value>').description('Set provider or language').action(async (key: string, valueArg: string) => run(async () => {
  const value = await loadConfig();
  if (key === 'lang') { value.lang = valueArg === 'ko' ? 'ko' : 'en'; await saveConfig(value); console.log(t('config.saved')); return; }
  if (key === 'provider') {
    if (!value.providers.some((p) => p.id === valueArg)) {
      const known = valueArg === 'openai' ? { type: 'openai' as const, model: 'gpt-4o-mini' } : valueArg === 'gemini' ? { type: 'gemini' as const, model: 'gemini-2.5-flash' } : valueArg === 'anthropic' ? { type: 'anthropic' as const, model: 'claude-3-5-sonnet-latest' } : { type: 'custom' as const, model: 'default' };
      value.providers.push({ id: valueArg, name: valueArg, type: known.type, defaultModel: known.model, enabled: true, ...(known.type === 'openai' ? { connectionMode: 'api-key' as const } : {}) });
    }
    value.activeProvider = valueArg; await saveConfig(value); console.log(t('config.saved')); return;
  }
  if (key === 'model') { const active = value.providers.find((p) => p.id === value.activeProvider); if (!active) throw new Error(t('error.invalidProvider', { provider: value.activeProvider })); active.defaultModel = valueArg; await saveConfig(value); console.log(t('config.saved')); return; }
  if (key === 'baseUrl') { const active = value.providers.find((p) => p.id === value.activeProvider); if (!active) throw new Error(t('error.invalidProvider', { provider: value.activeProvider })); active.baseUrl = valueArg; await saveConfig(value); console.log(t('config.saved')); return; }
  throw new Error(`Unknown config key: ${key}`);
}));
config.command('unset').argument('<key>').description('Remove a setting').action(async (key: string) => run(async () => {
  const value = await loadConfig();
  if (key === 'lang') delete value.lang;
  else throw new Error(`Unknown config key: ${key}`);
  await saveConfig(value); console.log(t('config.saved'));
}));
config.command('test').description('Check the active provider').action(async () => run(async () => {
  const value = await loadConfig(); const active = value.providers.find((p) => p.id === value.activeProvider);
  if (!active || active.id === 'local') { console.log(t('config.localReady')); return; }
  const key = active.type === 'openai' ? (process.env.SEED_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY) : active.type === 'gemini' ? process.env.SEED_GEMINI_API_KEY : active.type === 'anthropic' ? (process.env.SEED_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY) : process.env.SEED_API_KEY;
  if (!key) { console.log(t('config.emptyKey')); process.exitCode = 1; return; }
  console.log(t('config.keyConfigured', { provider: active.id }));
}));
config.command('remove').argument('<provider>').description('Remove a provider').action(async (provider: string) => run(async () => { const value = await loadConfig(); value.providers = value.providers.filter((p) => p.id !== provider); if (value.activeProvider === provider) value.activeProvider = 'local'; await saveConfig(value); console.log(t('config.saved')); }));

program.parseAsync(process.argv);
