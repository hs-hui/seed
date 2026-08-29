import { createSeed, SeedState, now, ConversationEntry, GrowthEvent } from '../domain.js';
import { randomUUID } from 'node:crypto';
import { SeedStore } from '../storage/store.js';

export async function plant(store: SeedStore, idea: string, name?: string): Promise<SeedState> {
  const seed = createSeed(idea, name); await store.create(seed);
  await addEvent(store, seed, 'plant', `Planted: ${idea}`);
  return seed;
}
export async function addConversation(store: SeedStore, entry: Omit<ConversationEntry, 'id' | 'createdAt'>): Promise<ConversationEntry> {
  const value: ConversationEntry = { ...entry, id: randomUUID(), createdAt: now() };
  await store.appendConversation(value); return value;
}
export async function addEvent(store: SeedStore, seed: SeedState, type: string, message: string, metadata?: Record<string, unknown>): Promise<void> {
  const event: GrowthEvent = { id: randomUUID(), seedId: seed.id, type, message, createdAt: now(), ...(metadata ? { metadata } : {}) };
  await store.appendEvent(event);
}
