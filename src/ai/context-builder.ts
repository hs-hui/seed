import { Branch, ConversationEntry, Decision, GrowthEvent, OpenQuestion, ResearchEntry, SeedState } from '../domain.js';

export type AIContext = {
  seedState: SeedState;
  coreIdea: string;
  importantDecisions: Decision[];
  openQuestions: OpenQuestion[];
  recentConversation: ConversationEntry[];
  relevantHistory?: GrowthEvent[];
  currentBranch?: Branch;
  branchContext?: { decisions: Decision[]; openQuestions: OpenQuestion[] };
  sunlightResearch?: ResearchEntry[];
  systemPrompt: string;
};

export type ContextExtras = {
  relevantHistory?: GrowthEvent[];
  sunlightResearch?: ResearchEntry[];
  /** The user asked for a simpler angle on the previous question. */
  preferSimpleQuestion?: boolean;
};

export function buildContext(seed: SeedState, command: string, recentConversation: ConversationEntry[] = [], currentBranch?: Branch, extras: ContextExtras = {}): AIContext {
  const branchId = currentBranch?.id;
  const scopedQuestions = seed.openQuestions.filter((question) => question.status === 'open' && (!branchId || !question.branchId || question.branchId === branchId) && (branchId || !question.branchId));
  const decisions = [...seed.decisions, ...(currentBranch?.decisions ?? [])];
  const scopedDecisions = decisions.filter((decision, index, all) => decision.confirmedByUser
    && all.findIndex((candidate) => candidate.id === decision.id) === index
    && (!branchId || !decision.branchId || decision.branchId === branchId)
    && (branchId || !decision.branchId));
  return {
    seedState: seed,
    coreIdea: currentBranch?.summary ?? seed.coreIdea,
    importantDecisions: scopedDecisions.slice(-10),
    openQuestions: scopedQuestions.sort((a, b) => importance(b.importance) - importance(a.importance)),
    recentConversation: recentConversation.slice(-10),
    ...(extras.relevantHistory?.length ? { relevantHistory: extras.relevantHistory.slice(-12) } : {}),
    ...(currentBranch ? { currentBranch } : {}),
    ...(currentBranch ? { branchContext: { decisions: currentBranch.decisions.filter((decision) => decision.confirmedByUser).slice(-10), openQuestions: currentBranch.openQuestions.filter((question) => question.status === 'open').slice(-10) } } : {}),
    ...(extras.sunlightResearch?.length ? { sunlightResearch: extras.sunlightResearch.slice(-8) } : {}),
    systemPrompt: `You are Seed's Gardener. Help the idea grow through ${command}. Ask one focused question at a time; reflect the user's words; identify contradictions politely; suggest pruning when scope grows; never make an unconfirmed decision; never invent facts; use TBD for unknowns; keep a thoughtful, caring tone rather than cheerleading.`,
  };
}
function importance(value: OpenQuestion['importance']): number { return value === 'high' ? 3 : value === 'medium' ? 2 : 1; }
