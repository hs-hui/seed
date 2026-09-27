import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import { input, select } from '@inquirer/prompts';
import type { ResearchEntry, SeedState } from '../domain.js';
import { now } from '../domain.js';
import { currentLanguage, t } from '../i18n/index.js';
import type { SeedStore } from '../storage/store.js';
import { waterInsight, waterPerspectives } from '../ai/provider.js';
import { addConversation, addEvent } from '../core/seed-manager.js';
import type { CommonOptions } from './config-commands.js';

export function registerWaterCommand(program: Command, deps: {
  addCommon: (command: Command) => Command;
  run: (action: () => Promise<void>, options: CommonOptions) => Promise<void>;
  targetStore: (selector?: string) => Promise<SeedStore>;
  currentSeed: (store: SeedStore) => Promise<SeedState>;
  print: (value: unknown, json?: boolean) => void;
}): void {
  const { addCommon, run, targetStore, currentSeed, print } = deps;
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
}
