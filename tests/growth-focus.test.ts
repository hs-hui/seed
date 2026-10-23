import { describe, expect, it } from 'vitest';
import { createSeed, type SeedState } from '../src/domain.js';
import { requiredGrowthFocus } from '../src/domain/growth-focus.js';

const complete = (): SeedState => {
  const seed = createSeed('idea');
  return {
    ...seed,
    users: ['builders'],
    problem: 'slow feedback',
    goals: ['ship faster'],
    constraints: ['one week'],
    assumptions: ['users will try it'],
  };
};

describe('requiredGrowthFocus', () => {
  it('asks for the earliest missing field in the fixed order', () => {
    const seed = createSeed('idea');
    expect(requiredGrowthFocus(seed)).toBe('user');

    const withUser = { ...seed, users: ['builders'] };
    expect(requiredGrowthFocus(withUser)).toBe('problem');

    const withProblem = { ...withUser, problem: 'slow feedback' };
    expect(requiredGrowthFocus(withProblem)).toBe('goal');

    const withGoal = { ...withProblem, goals: ['ship faster'] };
    expect(requiredGrowthFocus(withGoal)).toBe('constraint');

    const withConstraint = { ...withGoal, constraints: ['one week'] };
    expect(requiredGrowthFocus(withConstraint)).toBe('assumption');
  });

  it('moves to validation once every earlier field is filled', () => {
    expect(requiredGrowthFocus(complete())).toBe('validation');
  });
});
