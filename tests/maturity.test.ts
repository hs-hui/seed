import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/domain.js';
import { calculateMaturity, maturityBreakdown } from '../src/core/maturity.js';
import { dimensionsFor } from '../src/domain/maturity-dimensions.js';

describe('maturity policy', () => {
  it('keeps the existing open-question penalty and parent decision bonus', () => {
    const seed = createSeed('A small idea');
    const dimensions = seed.maturityDimensions.map((dimension) => ({ ...dimension, score: 80 }));
    const scored = { ...seed, maturityDimensions: dimensions,
      decisions: [{ id: 'd', seedId: seed.id, decision: 'x', reason: 'x', source: 'user', confirmedByUser: true, createdAt: '' }],
      openQuestions: [{ id: 'q', seedId: seed.id, question: 'x', importance: 'high' as const, status: 'open' as const, createdAt: '' }],
    };
    expect(maturityBreakdown(scored)).toEqual({ base: 80, penalty: 5, bonus: 2, score: 77 });
    expect(calculateMaturity(scored)).toBe(77);
  });

  it('does not inflate a fresh seed during a Bloom check', () => {
    const seed = createSeed('A vague idea');
    expect(calculateMaturity({ ...seed, maturity: 0, maturityDimensions: dimensionsFor(seed) })).toBeLessThanOrEqual(10);
  });

  it('only boosts the focused dimension without mutating the original evidence', () => {
    const seed = createSeed('A small idea');
    const boosted = dimensionsFor(seed, 'user', 4, 'ko');
    expect(boosted.find((dimension) => dimension.name === 'user')?.score).toBe(8);
    expect(boosted.find((dimension) => dimension.name === 'problem')?.score).toBe(0);
    expect(seed.maturityDimensions.find((dimension) => dimension.name === 'user')?.score).toBe(0);
  });
});
