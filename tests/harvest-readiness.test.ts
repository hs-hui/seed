import { describe, expect, it } from 'vitest';
import { createSeed } from '../src/domain.js';
import { assessHarvestReadiness } from '../src/core/harvest-readiness.js';

describe('document-specific harvest readiness', () => {
  it('keeps a bare idea exportable while identifying incomplete product documents', () => {
    const seed = createSeed('A small idea');
    expect(assessHarvestReadiness(seed, 'idea')).toEqual({ type: 'idea', ready: true, missing: [] });
    expect(assessHarvestReadiness(seed, 'prd').missing).toEqual(['problem', 'users', 'goals', 'scope']);
    expect(assessHarvestReadiness(seed, 'trd').missing).toContain('technical-direction');
  });

  it('does not mistake branch-scoped decisions for parent evidence', () => {
    const seed = createSeed('A tool');
    const withBranchDecision = { ...seed, problem: 'Hard to plan', users: ['Builders'], goals: ['Create a plan'],
      decisions: [{ id: 'b', seedId: seed.id, branchId: 'branch', decision: 'Use React', reason: '', source: 'user', confirmedByUser: true, createdAt: '' }],
    };
    expect(assessHarvestReadiness(withBranchDecision, 'trd').missing).toEqual(['scope', 'technical-direction']);
    expect(assessHarvestReadiness({ ...withBranchDecision, constraints: ['Web only'] }, 'trd').ready).toBe(true);
  });

  it('requires the right evidence for each document without using maturity as a substitute', () => {
    const seed = { ...createSeed('A tool'), maturity: 100, problem: 'Planning is hard', users: ['Teams'], goals: ['Make a plan'] };
    expect(assessHarvestReadiness(seed, 'brief').ready).toBe(true);
    expect(assessHarvestReadiness(seed, 'readme').ready).toBe(true);
    expect(assessHarvestReadiness(seed, 'prompt').missing).toEqual(['scope']);
    expect(assessHarvestReadiness(seed, 'prd').missing).toEqual(['scope']);
    expect(assessHarvestReadiness(seed, 'trd').missing).toEqual(['scope', 'technical-direction']);
    const scoped = { ...seed, constraints: ['Only one team'] };
    expect(assessHarvestReadiness(scoped, 'prompt').ready).toBe(true);
    expect(assessHarvestReadiness(scoped, 'prd').ready).toBe(true);
    expect(assessHarvestReadiness(scoped, 'trd').missing).toEqual(['technical-direction']);
  });
});
