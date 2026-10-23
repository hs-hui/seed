import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, atomicWrite, listFiles, withKeyedLock } from '../utils/fs.js';
import { buildHarvestInput, generateHarvestDocument } from '../ai/harvest-document.js';
import { HarvestResult, HarvestType, SeedState, now } from '../domain.js';
import { SeedStore } from '../storage/store.js';
import { addEvent } from './seed-manager.js';
import { t } from '../i18n/index.js';
import { assessHarvestReadiness } from './harvest-readiness.js';

// Harvest documents are AI-grounded only. The former template renderer was
// removed: it lifted technology choices from a keyword lexicon and cited
// research summaries, which the grounded path deliberately does not treat as
// evidence. Every document now comes from user-authored records that the
// provider must quote and that a second review must support.
const harvestTypes: HarvestType[] = ['idea', 'brief', 'prd', 'trd', 'readme', 'prompt'];
const titleKeys: Record<HarvestType | 'all', string> = {
  idea: 'harvest.type.idea', brief: 'harvest.type.brief', prd: 'harvest.type.prd', trd: 'harvest.type.trd',
  readme: 'harvest.type.readme', prompt: 'harvest.type.prompt', all: 'harvest.type.all',
};

async function harvestOneUnlocked(store: SeedStore, seed: SeedState, type: HarvestType, lang: 'en' | 'ko', draft: boolean, content: string): Promise<string> {
  // Callers hold the seed state lock, so version discovery, the markdown write,
  // the result record and the history event stay append-only together.
  const dir = path.join(store.base, 'harvest'); await ensureDir(dir);
  const existing = (await listFiles(dir)).filter((file) => new RegExp(`${type}-v\\d+\\.md$`).test(file));
  // Use the highest existing version rather than the file count. This keeps
  // harvesting append-only even when an older artifact was removed manually.
  const version = existing.reduce((highest, filePath) => {
    const match = filePath.match(new RegExp(`${type}-v(\\d+)\\.md$`));
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0) + 1;
  const file = path.join(dir, `${type}-v${version}.md`);
  let body = content;
  if (draft) {
    const missing = assessHarvestReadiness(seed, type).missing;
    if (missing.length) {
      const labels = missing.map((item) => t(`harvest.evidence.${item}`, {}, lang)).join(', ');
      body = `> ${t('harvest.draftNotice', { missing: labels }, lang)}\n\n${body}`;
    }
  }
  await atomicWrite(file, body);
  const current = await store.load();
  const harvested = current.status === 'dormant' || current.status === 'harvested' ? current : { ...current, status: 'harvested' as const, updatedAt: now() };
  if (harvested.status !== current.status) await store.save(harvested);
  const result: HarvestResult = { id: randomUUID(), seedId: seed.id, type, version, content: body, createdAt: now(), maturitySnapshot: seed.maturity };
  await store.saveHarvestResult(result);
  await addEvent(store, harvested, 'harvest', `Harvested ${type}`, { file, version });
  return file;
}

export async function harvest(store: SeedStore, type: HarvestType | 'all', lang: 'en' | 'ko', options: { draft?: boolean; providerId?: string; model?: string } = {}): Promise<string | string[]> {
  const statePath = path.join(store.base, 'seed.json');
  const snapshot = async () => {
    const current = await store.load();
    const [branches, conversations] = await Promise.all([store.branches(current.id), store.conversations(current.id)]);
    return { seed: current, branches, conversations };
  };
  // Compare only the evidence that generation consumed. Writing a harvest
  // updates seed status and timestamps, which must not invalidate a concurrent
  // harvest of the same unchanged records.
  const evidenceOf = (captured: Awaited<ReturnType<typeof snapshot>>) => JSON.stringify(buildHarvestInput(captured.seed, captured.branches, captured.conversations));
  const captured = await withKeyedLock(statePath, snapshot);
  if (captured.seed.status === 'dormant') throw new Error('seed-dormant');
  const types = type === 'all' ? harvestTypes : [type];
  if (!options.draft && types.some((entry) => !assessHarvestReadiness(captured.seed, entry).ready)) throw new Error('harvest-not-ready');
  const input = buildHarvestInput(captured.seed, captured.branches, captured.conversations);
  const documents = new Map<HarvestType, string>();
  // Generate AND verify the entire batch before saving the first file.
  for (const entry of types) documents.set(entry, await generateHarvestDocument(captured.seed, entry, lang, input, options));
  return withKeyedLock(statePath, async () => {
    if (evidenceOf(await snapshot()) !== evidenceOf(captured)) throw new Error('harvest-evidence-changed');
    const files: string[] = [];
    for (const entry of types) files.push(await harvestOneUnlocked(store, captured.seed, entry, lang, options.draft ?? false, documents.get(entry)!));
    return type === 'all' ? files : files[0]!;
  });
}
export function harvestTitle(type: HarvestType | 'all', lang: 'en' | 'ko' = 'en'): string { return t(titleKeys[type], {}, lang); }
