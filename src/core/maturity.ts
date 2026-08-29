import { OpenQuestion, SeedState, seedStatuses } from '../domain.js';

export function calculateMaturity(seed: SeedState): number {
  const base = seed.maturityDimensions.length
    ? seed.maturityDimensions.reduce((sum, d) => sum + d.score, 0) / seed.maturityDimensions.length
    : seed.maturity;
  const penalty = seed.openQuestions.filter((q) => q.status === 'open' && q.importance === 'high').length * 5;
  const bonus = Math.min(seed.decisions.filter((d) => d.confirmedByUser).length * 2, 10);
  return Math.max(0, Math.min(100, Math.round(base - penalty + bonus)));
}
export function statusForMaturity(maturity: number): SeedState['status'] {
  if (maturity <= 20) return 'seedling';
  if (maturity <= 40) return 'growing';
  if (maturity <= 60) return 'branching';
  if (maturity <= 80) return 'blooming';
  return 'mature';
}
export function maturityLabel(status: SeedState['status']): string {
  const index = seedStatuses.indexOf(status); return index < 0 ? status : status;
}
export function clearItems(seed: SeedState): string[] {
  return seed.maturityDimensions.filter((d) => d.score >= 60).map((d) => d.name);
}
export function uncertainItems(seed: SeedState): string[] {
  return seed.maturityDimensions.filter((d) => d.score < 60).map((d) => d.name);
}
export function exploreItems(seed: SeedState): string[] {
  const questions = seed.openQuestions.filter((q) => q.status === 'open').map((q) => q.question);
  return questions.length ? questions.slice(0, 3) : uncertainItems(seed).slice(0, 3);
}
