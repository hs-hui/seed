import type { GrowthFocus, SeedState } from '../domain.js';

/**
 * The single ordered rule for the next field a growing seed still lacks.
 * Core growth and the AI provider both read it, so they cannot disagree.
 */
export function requiredGrowthFocus(seed: SeedState): GrowthFocus {
  if (!seed.users.length) return 'user';
  if (!seed.problem) return 'problem';
  if (!seed.goals.length) return 'goal';
  if (!seed.constraints.length) return 'constraint';
  if (!seed.assumptions.length) return 'assumption';
  return 'validation';
}
