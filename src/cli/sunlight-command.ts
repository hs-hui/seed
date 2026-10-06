import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import type { ResearchEntry, SeedState } from '../domain.js';
import { now } from '../domain.js';
import { currentLanguage, t } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { dimensionsFor, sunlightAnalysis } from '../ai/provider.js';
import { calculateMaturity } from '../core/maturity.js';
import { addEvent } from '../core/seed-manager.js';
import { webSources } from '../core/sunlight.js';
import { withKeyedLock } from '../utils/fs.js';
import path from 'node:path';
import type { CommonOptions } from './config-commands.js';

export function registerSunlightCommand(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
}): void {
  const { addCommon, run, targetStore, currentSeed, print } = deps;
  const sunlight = addCommon(program.command('sunlight').description(t('help.sunlight'))).option('--web', t('cli.webOption')).option('--no-web', t('cli.noWebOption'));
  sunlight.action(async (options: CommonOptions & { web?: boolean }) => run(async () => {
    const store = await targetStore(options.seed); const seed = await currentSeed(store); if (seed.status === 'dormant') throw new Error('seed-dormant'); const sources = options.web ? await webSources(seed.coreIdea) : [];
    const analysis = await sunlightAnalysis(seed, sources, options.provider, options.model, currentLanguage());
    // Facts and estimates need separate records so their metadata stays distinct.
    const researchEntries: ResearchEntry[] = analysis.areas.flatMap((area) => {
      const entries: ResearchEntry[] = [];
      if (area.findings.length) entries.push({ id: randomUUID(), seedId: seed.id, source: 'ai://sunlight', title: area.name, summary: area.findings.join('\n'), relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: true });
      if (area.facts.length) entries.push({ id: randomUUID(), seedId: seed.id, source: 'ai://sunlight/facts', title: `${area.name} — ${t('sunlight.fact')}`, summary: area.facts.join('\n'), relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: false });
      if (area.estimates.length) entries.push({ id: randomUUID(), seedId: seed.id, source: 'ai://sunlight/estimates', title: `${area.name} — ${t('sunlight.estimate')}`, summary: area.estimates.join('\n'), relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: true });
      return entries;
    });
    for (const source of sources) researchEntries.push({ id: randomUUID(), seedId: seed.id, source: source.source, title: source.title, summary: source.snippet, relevance: 'medium', retrievedAt: now(), isVerified: false, isEstimate: true });
    const result = await withKeyedLock(path.join(store.base, 'seed.json'), async () => {
      const latest = await store.load();
      if (latest.status === 'dormant') throw new Error('seed-dormant');
      for (const entry of researchEntries) await store.saveResearch(entry);
      const newAssumptions = analysis.assumptions.filter((assumption) => !latest.assumptions.includes(assumption));
      const newQuestions = analysis.openQuestions.filter((question) => !latest.openQuestions.some((existing) => existing.question === question)).map((question) => ({ id: randomUUID(), seedId: latest.id, question, focus: 'validation' as const, importance: 'high' as const, status: 'open' as const, createdAt: now() }));
      const updated: SeedState = { ...latest, assumptions: [...latest.assumptions, ...newAssumptions], openQuestions: [...latest.openQuestions, ...newQuestions], status: latest.status === 'harvested' ? 'harvested' : 'evaluating', updatedAt: now() };
      updated.maturityDimensions = dimensionsFor(updated, undefined, 0, currentLanguage());
      updated.maturity = calculateMaturity(updated); await store.save(updated); await addEvent(store, updated, 'sunlight', 'Sunlight reality check completed', { web: Boolean(options.web), researchCount: researchEntries.length });
      return { areas: analysis.areas, assumptions: analysis.assumptions, openQuestions: analysis.openQuestions, sources, maturity: updated.maturity, research: researchEntries };
    });
    if (options.json) print(result, true);
    else { console.log(t('sunlight.title')); for (const area of analysis.areas) { console.log(`\n[${area.name}]`); for (const finding of area.findings) console.log(`- ${finding}`); for (const fact of area.facts) console.log(`- ${t('sunlight.fact')}: ${fact}`); for (const estimate of area.estimates) console.log(`- ${t('sunlight.estimate')}: ${estimate}`); } if (sources.length) console.log(`\n${t('sunlight.sources', { count: sources.length })}`); if (analysis.assumptions.length) console.log(`\n${t('sunlight.assumptions')}: ${analysis.assumptions.join('; ')}`); if (analysis.openQuestions.length) console.log(`\n${t('sunlight.questions')}: ${analysis.openQuestions.join('; ')}`); console.log(`\n${t('sunlight.saved', { count: researchEntries.length })}`); }
  }, options));
}
