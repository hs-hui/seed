import type { Command } from 'commander';
import type { SeedState } from '../domain.js';
import { currentLanguage, t } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { evaluateMaturity } from '../ai/provider.js';
import { calculateMaturity, statusForMaturity } from '../core/maturity.js';
import { addEvent } from '../core/seed-manager.js';
import { withKeyedLock } from '../utils/fs.js';
import path from 'node:path';
import type { CommonOptions } from './config-commands.js';

export function registerBloomCommand(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
}): void {
  const { addCommon, run, targetStore, currentSeed, print } = deps;
  const bloom = addCommon(program.command('bloom').description(t('help.bloom')));
  bloom.action(async (options: CommonOptions) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const research = await store.research(seed.id); const evaluation = await evaluateMaturity(seed, options.provider, options.model, currentLanguage(), research); const dimensions = evaluation.dimensions;
    const updated = await withKeyedLock(path.join(store.base, 'seed.json'), async () => {
      const latest = await store.load();
      if (latest.status === 'dormant') throw new Error('seed-dormant');
      const current: SeedState = { ...latest, maturityDimensions: dimensions, maturity: 0 };
      current.maturity = calculateMaturity(current);
      // A bloom review after harvest must not reopen a completed seed.
      current.status = latest.status === 'harvested' ? 'harvested' : statusForMaturity(current.maturity);
      await store.save(current); await addEvent(store, current, 'bloom', `Bloom check: ${current.maturity}%`);
      return current;
    });
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
}
