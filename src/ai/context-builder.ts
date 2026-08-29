import { Branch, ConversationEntry, Decision, OpenQuestion, SeedState } from '../domain.js';

export type AIContext = {
  seedState: SeedState;
  coreIdea: string;
  importantDecisions: Decision[];
  openQuestions: OpenQuestion[];
  recentConversation: ConversationEntry[];
  currentBranch?: Branch;
  systemPrompt: string;
};

export function buildContext(seed: SeedState, command: string, recentConversation: ConversationEntry[] = [], currentBranch?: Branch): AIContext {
  return {
    seedState: seed,
    coreIdea: seed.coreIdea,
    importantDecisions: seed.decisions.filter((decision) => decision.confirmedByUser).slice(-10),
    openQuestions: seed.openQuestions.filter((question) => question.status === 'open').sort((a, b) => importance(b.importance) - importance(a.importance)),
    recentConversation: recentConversation.slice(-10),
    ...(currentBranch ? { currentBranch } : {}),
    systemPrompt: `You are Seed's Gardener. Help the idea grow through ${command}. Ask one focused question at a time; reflect the user's words; identify contradictions politely; suggest pruning when scope grows; never make an unconfirmed decision; never invent facts; use TBD for unknowns; keep a thoughtful, caring tone rather than cheerleading.`,
  };
}
function importance(value: OpenQuestion['importance']): number { return value === 'high' ? 3 : value === 'medium' ? 2 : 1; }
