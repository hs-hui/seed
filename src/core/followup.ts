import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { SeedState, now } from '../domain.js';
import { SeedStore } from '../storage/store.js';
import { withKeyedLock } from '../utils/fs.js';
import { addConversation } from './seed-manager.js';

async function appendWakeFollowUpUnlocked(store: SeedStore, question: string): Promise<SeedState> {
  // Re-read inside the lock: a concurrent command may have changed the seed since the caller loaded it.
  const latest = await store.load();
  const openQuestion = { id: randomUUID(), seedId: latest.id, question, focus: 'validation' as const, importance: 'medium' as const, status: 'open' as const, createdAt: now() };
  await addConversation(store, { seedId: latest.id, role: 'assistant', type: 'question', content: question, metadata: { focus: 'validation', source: 'wake' } });
  const updated: SeedState = { ...latest, openQuestions: [...latest.openQuestions, openQuestion], updatedAt: now() };
  await store.save(updated);
  return updated;
}

/** Record the question asked right after waking a dormant seed, under the same lock as other state changes. */
export async function appendWakeFollowUp(store: SeedStore, question: string): Promise<SeedState> {
  return withKeyedLock(path.join(store.base, 'seed.json'), () => appendWakeFollowUpUnlocked(store, question));
}
