import { z } from 'zod';
import { randomUUID } from 'node:crypto';

export const SEED_VERSION = 1;

export const seedStatuses = [
  'seedling', 'growing', 'branching', 'pruning', 'evaluating',
  'blooming', 'mature', 'harvested', 'dormant',
] as const;
export type SeedStatus = (typeof seedStatuses)[number];

export type MaturityDimension = { name: string; score: number; reason: string };
export type Decision = {
  id: string; seedId: string; branchId?: string; decision: string; reason: string;
  source: string; confirmedByUser: boolean; createdAt: string;
};
export type OpenQuestion = {
  id: string; seedId: string; branchId?: string; question: string;
  importance: 'low' | 'medium' | 'high'; status: 'open' | 'answered' | 'cancelled';
  answer?: string; answeredAt?: string; createdAt: string;
};
export type Branch = {
  id: string; seedId: string; name: string; slug: string; summary: string; direction: string;
  status: 'active' | 'pruned' | 'dormant' | 'merged'; maturity: number;
  parentBranchId?: string; assumptions: string[]; decisions: Decision[];
  openQuestions: OpenQuestion[]; createdAt: string; updatedAt: string;
};
export type ConversationEntry = {
  id: string; seedId: string; branchId?: string;
  role: 'user' | 'assistant' | 'system'; type: 'question' | 'answer' | 'summary' | 'insight' | 'prune-suggestion';
  content: string; metadata?: Record<string, unknown>; createdAt: string;
};
export type GrowthEvent = {
  id: string; seedId: string; type: string; message: string; createdAt: string;
  metadata?: Record<string, unknown>;
};
export type HarvestType = 'idea' | 'brief' | 'prd' | 'trd';
export type SeedState = {
  version: number; id: string; name: string; status: SeedStatus; maturity: number;
  maturityDimensions: MaturityDimension[]; originalIdea: string; coreIdea: string;
  problem: string; users: string[]; goals: string[]; constraints: string[];
  branches: string[]; activeBranch?: string; prunedItems: string[];
  decisions: Decision[]; openQuestions: OpenQuestion[]; assumptions: string[];
  createdAt: string; updatedAt: string; parentSeedId?: string;
};

const decisionSchema = z.object({
  id: z.string(), seedId: z.string(), branchId: z.string().optional(), decision: z.string(),
  reason: z.string(), source: z.string(), confirmedByUser: z.boolean(), createdAt: z.string(),
});
const questionSchema = z.object({
  id: z.string(), seedId: z.string(), branchId: z.string().optional(), question: z.string(),
  importance: z.enum(['low', 'medium', 'high']), status: z.enum(['open', 'answered', 'cancelled']),
  answer: z.string().optional(), answeredAt: z.string().optional(), createdAt: z.string(),
});
export const seedSchema = z.object({
  version: z.number(), id: z.string(), name: z.string(), status: z.enum(seedStatuses),
  maturity: z.number().min(0).max(100),
  maturityDimensions: z.array(z.object({ name: z.string(), score: z.number().min(0).max(100), reason: z.string() })),
  originalIdea: z.string(), coreIdea: z.string(), problem: z.string(), users: z.array(z.string()),
  goals: z.array(z.string()), constraints: z.array(z.string()), branches: z.array(z.string()),
  activeBranch: z.string().optional(), prunedItems: z.array(z.string()), decisions: z.array(decisionSchema),
  openQuestions: z.array(questionSchema), assumptions: z.array(z.string()), createdAt: z.string(), updatedAt: z.string(),
  parentSeedId: z.string().optional(),
});

export function now(): string { return new Date().toISOString(); }
export function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '');
  return slug || 'seed';
}
export function emptyDimensions(): MaturityDimension[] {
  return ['problem', 'user', 'core value', 'differentiation', 'scope', 'feasibility', 'motivation', 'confidence']
    .map((name) => ({ name, score: 0, reason: 'Not explored yet' }));
}
export function createSeed(originalIdea: string, name = deriveName(originalIdea), parentSeedId?: string): SeedState {
  const timestamp = now();
  return {
    version: SEED_VERSION, id: randomUUID(), name, status: 'seedling', maturity: 5,
    maturityDimensions: emptyDimensions(), originalIdea, coreIdea: originalIdea, problem: '', users: [],
    goals: [], constraints: [], branches: [], prunedItems: [], decisions: [], openQuestions: [], assumptions: [],
    createdAt: timestamp, updatedAt: timestamp, ...(parentSeedId ? { parentSeedId } : {}),
  };
}
export function deriveName(idea: string): string {
  const words = idea.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  return words.join(' ') || 'Untitled Seed';
}
