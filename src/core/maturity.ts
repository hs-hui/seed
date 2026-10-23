import { SeedState } from '../domain.js';

export function maturityBreakdown(seed: SeedState): { base: number; penalty: number; bonus: number; score: number } {
  const base = seed.maturityDimensions.length
    ? seed.maturityDimensions.reduce((sum, d) => sum + d.score, 0) / seed.maturityDimensions.length
    : seed.maturity;
  const penalty = seed.openQuestions.filter((q) => q.status === 'open' && q.importance === 'high').length * 5;
  const bonus = Math.min(seed.decisions.filter((d) => d.confirmedByUser).length * 2, 10);
  return { base, penalty, bonus, score: Math.max(0, Math.min(100, Math.round(base - penalty + bonus))) };
}
export function calculateMaturity(seed: SeedState): number {
  return maturityBreakdown(seed).score;
}
export function statusForMaturity(maturity: number): SeedState['status'] {
  if (maturity <= 20) return 'seedling';
  if (maturity <= 40) return 'growing';
  if (maturity <= 60) return 'branching';
  if (maturity <= 80) return 'blooming';
  return 'mature';
}
