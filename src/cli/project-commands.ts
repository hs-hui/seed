import type { Command } from 'commander';
import type { SeedState } from '../domain.js';
import { t } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { gardenEntries } from '../core/garden.js';
import type { CommonOptions } from './config-commands.js';

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

export function registerProjectCommands(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  jsonRequested: (options?: CommonOptions) => boolean;
  print: (value: unknown, json?: boolean) => void;
  statusLabel: (status: SeedState['status']) => string;
  workspace: { interactiveRepl: (options: Pick<CommonOptions, 'provider' | 'model'>, root?: string) => Promise<void> };
}): void {
  const { addCommon, run, targetStore, currentSeed, jsonRequested, print, statusLabel, workspace } = deps;

  const garden = addCommon(program.command('garden').description(t('help.garden'))).argument('[selection]', t('cli.gardenArgument'));
  garden.action(async (selection: string | undefined, options: CommonOptions) => run(async () => {
    // Discover nearby projects without creating an empty `.seed/` directory.
    const entries = await gardenEntries(process.cwd());
    const value = entries.map((entry) => ({ path: entry.path, name: entry.seed.name, id: entry.seed.id, status: entry.seed.status, maturity: entry.seed.maturity, coreIdea: entry.seed.coreIdea, updatedAt: entry.seed.updatedAt, parentSeedId: entry.seed.parentSeedId }));
    if (selection) {
      const normalized = selection.trim().toLocaleLowerCase();
      const index = Number(selection) - 1;
      const selected = Number.isInteger(index) && index >= 0 ? value[index] : value.find((entry) => entry.id.toLocaleLowerCase() === normalized || entry.name.toLocaleLowerCase() === normalized || entry.path.toLocaleLowerCase() === normalized);
      if (!selected) throw new Error('seed-selection-not-found');
      if (jsonRequested(options) || !process.stdin.isTTY || options.input === false) { print(selected, jsonRequested(options)); return; }
      console.log(t('garden.opened', { name: selected.name }));
      await workspace.interactiveRepl(options, selected.path);
      return;
    }
    if (options.json) print(value, true); else { console.log(t('garden.title')); if (!value.length) console.log(t('garden.empty')); else for (const entry of value) console.log(`\n🌱 ${entry.name} (${entry.maturity}%) — ${statusLabel(entry.status)}\n   ${entry.path}\n   ${entry.coreIdea}\n   ${t('garden.updated', { date: new Date(entry.updatedAt).toLocaleString() })}`); }
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
}
