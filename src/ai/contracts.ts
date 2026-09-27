import type { Branch, ConversationEntry, GrowthFocus, MaturityDimension, SeedState } from '../domain.js';
import type { ContextExtras } from './context-builder.js';

export type ProviderLanguage = 'en' | 'ko';
export type GrowthUpdate = {
  updatedSummary: string;
  questionReason: string;
  contradictionsDetected: string[];
  suggestions: string[];
  maturityDelta: number;
};
export type GrowthSuggestion = { question: string; maturityDelta: number; focus?: GrowthFocus };
export type MaturityEvaluation = { dimensions: MaturityDimension[]; clear: string[]; uncertain: string[]; explore: string[] };
export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ProviderConnection = { success: boolean; latencyMs: number; error?: string };

export interface LLMProvider {
  readonly id: string;
  readonly model: string;
  ask(prompt: string): Promise<string>;
  chat(messages: ProviderMessage[]): Promise<string>;
  stream(prompt: string): AsyncIterable<string>;
  testConnection(): Promise<ProviderConnection>;
  listModels(): Promise<string[]>;
}

/** The core's AI operations; no transport, credentials, or prompt format leaks in. */
export interface CoreAI {
  nextQuestion(seed: SeedState, providerId?: string, model?: string, language?: ProviderLanguage, recentConversation?: ConversationEntry[], currentBranch?: Branch, contextExtras?: ContextExtras, preferSimpleQuestion?: boolean): Promise<GrowthSuggestion>;
  growthUpdate(seed: SeedState, answer: string, providerId?: string, model?: string, language?: ProviderLanguage, recentConversation?: ConversationEntry[], currentBranch?: Branch, contextExtras?: ContextExtras): Promise<GrowthUpdate>;
  suggestBranches(seed: SeedState, providerId?: string, model?: string, language?: ProviderLanguage): Promise<Array<{ name: string; summary: string }>>;
  suggestPrune(seed: SeedState, providerId?: string, model?: string, language?: ProviderLanguage): Promise<Array<{ item: string; reason: string }>>;
  dimensionsFor(seed: SeedState, focus?: GrowthFocus, maturityDelta?: number, language?: ProviderLanguage): MaturityDimension[];
  inferProviderLanguage(preferred: ProviderLanguage, texts?: string[]): ProviderLanguage;
  isBeginnerFriendlyQuestion(value: string, language: ProviderLanguage): boolean;
}
