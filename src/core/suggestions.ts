import type { SeedStore } from '../storage/store.js';
import { addConversation } from './seed-manager.js';

// A numeric or name selection must refer to the list the user was shown. Each
// shown list is stored as one JSON entry so the latest one can be re-read later
// instead of regenerating (AI output reorders, which would shift the choice).
export type SuggestionSource = 'branch' | 'evolve' | 'water-perspectives';

export async function latestSuggestions<T>(store: SeedStore, seedId: string, source: SuggestionSource): Promise<T[] | undefined> {
  const latest = (await store.conversations(seedId)).filter((entry) => entry.metadata?.source === source && entry.role === 'assistant' && entry.type === 'insight').at(-1);
  if (!latest) return undefined;
  try { const parsed: unknown = JSON.parse(latest.content); return Array.isArray(parsed) ? parsed as T[] : undefined; } catch { return undefined; }
}

export async function saveSuggestions(store: SeedStore, seedId: string, source: SuggestionSource, items: unknown[]): Promise<void> {
  await addConversation(store, { seedId, role: 'assistant', type: 'insight', content: JSON.stringify(items), metadata: { source } });
}
