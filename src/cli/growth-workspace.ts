import type { Command } from 'commander';
import { input } from '@inquirer/prompts';
import { SeedState } from '../domain.js';
import { t, currentLanguage } from '../i18n/index.js';
import { openStore, SeedStore } from '../storage/store.js';
import { askGrowthQuestion } from '../core/growth.js';
import { inferProviderLanguage, isBeginnerFriendlyQuestion } from '../ai/provider.js';
import type { CommonOptions } from './config-commands.js';

type GrowthSessionOptions = Pick<CommonOptions, 'provider' | 'model'>;

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

export function createGrowthWorkspace(deps: {
  program: Command;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  printGrowthQuestion: (question: string, firstTurn: boolean) => void;
}) {
  const { program, currentSeed, printGrowthQuestion } = deps;
  const workspace = {
    rootOverride: undefined as string | undefined,
    exitRequested: false,
    depth: 0,
    interactiveRepl,
  };

  async function announceNextGrowthQuestion(options: GrowthSessionOptions, rootOverride?: string): Promise<void> {
    const store = rootOverride ? new SeedStore(rootOverride) : (workspace.rootOverride ? new SeedStore(workspace.rootOverride) : await openStore());
    const seed = await currentSeed(store);
    if (seed.status === 'dormant') return;
    const branchId = seed.activeBranch;
    const pending = seed.openQuestions.find((entry) => entry.status === 'open' && entry.branchId === branchId);
    // Older persisted questions still need the current safety check.
    if (pending && isBeginnerFriendlyQuestion(pending.question, inferProviderLanguage(currentLanguage(), [seed.originalIdea, seed.coreIdea, pending.question]))) return;
    const question = await askGrowthQuestion(store, seed, options.provider, branchId, options.model, currentLanguage());
    printGrowthQuestion(question, false);
  }

  /** Keep a conversational workspace open across command and free-text turns. */
  async function interactiveRepl(options: GrowthSessionOptions = {}, rootOverride?: string): Promise<void> {
    const previousRoot = workspace.rootOverride;
    const previousCwd = process.cwd();
    if (rootOverride) {
      workspace.rootOverride = rootOverride;
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
          workspace.depth += 1;
          try { await program.parseAsync([process.argv[0] ?? 'node', process.argv[1] ?? 'seed', 'grow', '--answer', line], { from: 'node' }); }
          catch (error) { const message = error instanceof Error ? error.message : String(error); console.error(t('error.generic', { message })); }
          finally { workspace.depth -= 1; }
          if (workspace.exitRequested) return;
          await announceNextGrowthQuestion(options, rootOverride);
          continue;
        }
        if (!commands.has(command)) { console.log(t('repl.unknown')); continue; }
        workspace.depth += 1;
        try {
          await program.parseAsync([process.argv[0] ?? 'node', process.argv[1] ?? 'seed', command, ...tokens.slice(1)], { from: 'node' });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(t('error.generic', { message }));
        } finally { workspace.depth -= 1; }
        if (workspace.exitRequested) return;
        if (command === 'grow' || command === 'wake' || command === 'branch' || command === 'prune' || command === 'restore') await announceNextGrowthQuestion(options, rootOverride);
      }
    } finally {
      workspace.rootOverride = previousRoot;
      if (rootOverride) process.chdir(previousCwd);
    }
  }

  return workspace;
}
