import type { HarvestType, SeedState } from '../domain.js';

export type MissingEvidence = 'idea' | 'problem' | 'users' | 'goals' | 'scope' | 'technical-direction';
export type HarvestReadiness = { type: HarvestType; ready: boolean; missing: MissingEvidence[] };

const requirements: Record<HarvestType, MissingEvidence[]> = {
  idea: ['idea'],
  brief: ['idea', 'problem', 'users', 'goals'],
  prd: ['idea', 'problem', 'users', 'goals', 'scope'],
  trd: ['idea', 'problem', 'users', 'goals', 'scope', 'technical-direction'],
  readme: ['idea', 'problem', 'users', 'goals'],
  prompt: ['idea', 'problem', 'goals', 'scope'],
};

/** Minimum recorded evidence, not an AI judgment or a maturity threshold. */
export function assessHarvestReadiness(seed: SeedState, type: HarvestType): HarvestReadiness {
  const confirmed = seed.decisions.filter((decision) => decision.confirmedByUser && !decision.branchId);
  const evidence: Record<MissingEvidence, boolean> = {
    idea: Boolean(seed.coreIdea.trim()),
    problem: Boolean(seed.problem.trim()),
    users: seed.users.some((user) => Boolean(user.trim())),
    goals: seed.goals.some((goal) => Boolean(goal.trim())),
    scope: seed.constraints.some((constraint) => Boolean(constraint.trim())) || seed.prunedItems.length > 0 || confirmed.length > 0,
    'technical-direction': [...seed.constraints, ...confirmed.map((decision) => decision.decision)]
      .some((text) => /\b(web|mobile|desktop|cli|api|react|node|python|postgres|sqlite|flutter|swift|kotlin|docker|aws|gcp|azure)\b|웹|모바일|데스크톱|서버|데이터베이스/i.test(text)),
  };
  const missing = requirements[type].filter((item) => !evidence[item]);
  return { type, ready: missing.length === 0, missing };
}
