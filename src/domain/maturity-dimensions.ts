import type { GrowthFocus, MaturityDimension, SeedState } from '../domain.js';

export function dimensionsFor(seed: SeedState, focus?: GrowthFocus, maturityDelta = 0, language: 'en' | 'ko' = 'en'): MaturityDimension[] {
  const hasProblem = Boolean(seed.problem); const hasUser = seed.users.length > 0; const hasGoals = seed.goals.length > 0; const hasBranch = seed.branches.length > 0;
  const base: Record<string, number> = {
    // Do not award maturity for information that has not been supplied yet.
    // Small evidence-based floors keep the score readable without making a
    // brand-new idea look half-built during its first Bloom check.
    problem: hasProblem ? 70 : 0,
    user: hasUser ? 70 : 0,
    'core value': hasGoals ? 65 : 0,
    differentiation: hasBranch ? 70 : seed.goals.length > 1 ? 50 : 0,
    scope: seed.prunedItems.length || seed.constraints.length ? 70 : 10,
    feasibility: seed.assumptions.length ? 65 : 10,
    motivation: hasGoals ? 75 : 10,
    confidence: seed.decisions.length || seed.openQuestions.some((question) => question.status === 'answered') ? 55 : 10,
  };
  const focusDimension: Record<GrowthFocus, string> = { user: 'user', problem: 'problem', goal: 'core value', constraint: 'scope', assumption: 'feasibility', validation: 'confidence' };
  const boost = Math.max(0, Math.min(16, Math.round(maturityDelta) * 2));
  const supportedReason = language === 'ko' ? '현재 Seed 상태에서 근거가 확인됩니다.' : 'Supported by the current seed state.';
  const needsReason = language === 'ko' ? '한 번 더 집중해서 성장시켜 보세요.' : 'Needs another focused growth turn.';
  return seed.maturityDimensions.map((dimension) => {
    const evidenceScore = Math.max(base[dimension.name] ?? 0, dimension.score);
    const score = Math.min(100, evidenceScore + (focus && focusDimension[focus] === dimension.name ? boost : 0));
    return { ...dimension, score, reason: score >= 60 ? supportedReason : needsReason };
  });
}
