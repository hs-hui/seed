import { afterEach, describe, expect, it, vi } from 'vitest';
import { input } from '@inquirer/prompts';
import type { SeedState } from '../src/domain.js';
import type { SeedStore } from '../src/storage/store.js';
import { interactiveGrowthSession } from '../src/cli/growth-session.js';

vi.mock('@inquirer/prompts', () => ({ input: vi.fn() }));

describe('interactive growth session', () => {
  const seed = { status: 'growing', openQuestions: [], users: [], goals: [], constraints: [], assumptions: [], maturity: 0 } as unknown as SeedState;
  const load = vi.fn(async () => seed);
  const store = { load } as unknown as SeedStore;

  afterEach(() => {
    vi.mocked(input).mockReset();
    load.mockClear();
    vi.restoreAllMocks();
  });

  it('marks an explicit exit without writing a growth turn', async () => {
    vi.mocked(input).mockResolvedValueOnce('/exit');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const session = { exitRequested: false };

    const result = await interactiveGrowthSession(session, store, seed, {}, 'Who is this for?', true);

    expect(result).toBe(seed);
    expect(session.exitRequested).toBe(true);
    expect(load).toHaveBeenCalledOnce();
  });

  it('keeps the workspace open when the user pauses', async () => {
    vi.mocked(input).mockResolvedValueOnce('pause');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const session = { exitRequested: true };

    const result = await interactiveGrowthSession(session, store, seed, {}, 'Who is this for?', true);

    expect(result).toBe(seed);
    expect(session.exitRequested).toBe(false);
    expect(load).toHaveBeenCalledOnce();
  });
});
