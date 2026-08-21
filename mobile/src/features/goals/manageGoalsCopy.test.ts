import { canEndGoal, goalRowSubtitle } from './manageGoalsCopy';

import type { CommitmentRead } from './commitments';

function progress(overrides: Partial<CommitmentRead['progress']> = {}): CommitmentRead['progress'] {
  return {
    blocks: [],
    current_streak: 0,
    longest_streak: 0,
    weeks_passed: 0,
    weeks_total: 1,
    ...overrides,
  };
}

describe('goalRowSubtitle', () => {
  it('renders a targeted, fixed-length active goal as "amount · frequency · week N of M"', () => {
    const subtitle = goalRowSubtitle(
      {
        target_value: 2,
        target_unit: 'miles',
        sessions_per_week: 2,
        duration_weeks: 2,
        progress: progress({ blocks: [{ index: 1, starts_on: '', ends_on: '', sessions_done: 0, sessions_required: 2, status: 'in_progress' }] }),
      },
      'active',
    );
    expect(subtitle).toBe('2 mi · 2×/wk · week 2 of 2');
  });

  it('renders an untargeted, ongoing active goal as "frequency · ongoing"', () => {
    const subtitle = goalRowSubtitle(
      {
        target_value: null,
        target_unit: null,
        sessions_per_week: 4,
        duration_weeks: null,
        progress: progress(),
      },
      'active',
    );
    expect(subtitle).toBe('4×/wk · ongoing');
  });

  it('renders "Every day" for sessions_per_week === 7, with a fixed-length position', () => {
    const subtitle = goalRowSubtitle(
      {
        target_value: null,
        target_unit: null,
        sessions_per_week: 7,
        duration_weeks: 3,
        progress: progress({ blocks: [{ index: 0, starts_on: '', ends_on: '', sessions_done: 0, sessions_required: 7, status: 'in_progress' }] }),
      },
      'active',
    );
    expect(subtitle).toBe('Every day · week 1 of 3');
  });

  it('renders a finished goal as "amount · frequency · X of Y weeks passed"', () => {
    const subtitle = goalRowSubtitle(
      {
        target_value: 5,
        target_unit: 'miles',
        sessions_per_week: 3,
        duration_weeks: 2,
        progress: progress({ weeks_passed: 2, weeks_total: 2 }),
      },
      'finished',
    );
    expect(subtitle).toBe('5 mi · 3×/wk · 2 of 2 weeks passed');
  });
});

describe('canEndGoal', () => {
  it('allows ending an active goal', () => {
    expect(canEndGoal('active')).toBe(true);
  });

  it('does not allow ending a finished goal -- there is nothing left to end', () => {
    expect(canEndGoal('finished')).toBe(false);
  });
});
