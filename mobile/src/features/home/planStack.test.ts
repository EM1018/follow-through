import { buildPlanStack, type PlanRead } from './planStack';

function makePlan(overrides: Partial<PlanRead> & { id: string }): PlanRead {
  return {
    user_id: 'user',
    name: 'Plan',
    starts_on: '2026-08-01',
    ends_on: null,
    is_active: false,
    visible_to_friends: false,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function names(stack: ReturnType<typeof buildPlanStack>): string[] {
  return stack.map((item) => (item.kind === 'plan' ? item.plan.name : 'create'));
}

describe('buildPlanStack', () => {
  const today = new Date(2026, 7, 12); // August 12 2026, local midnight

  it('puts the active plan first, then the rest newest-created first', () => {
    const oldest = makePlan({ id: '1', name: 'Oldest', created_at: '2026-08-01T00:00:00Z' });
    const active = makePlan({
      id: '2',
      name: 'Active',
      is_active: true,
      created_at: '2026-08-05T00:00:00Z',
    });
    const newest = makePlan({ id: '3', name: 'Newest', created_at: '2026-08-10T00:00:00Z' });

    const stack = buildPlanStack([oldest, active, newest], today);

    expect(names(stack)).toEqual(['Active', 'Newest', 'Oldest', 'create']);
  });

  it('drops plans that ended before today', () => {
    const ended = makePlan({ id: '1', name: 'Ended', ends_on: '2026-08-11' });
    const ongoing = makePlan({ id: '2', name: 'Ongoing', ends_on: '2026-08-13' });

    const stack = buildPlanStack([ended, ongoing], today);

    expect(names(stack)).toEqual(['Ongoing', 'create']);
  });

  it('treats a plan ending exactly today as not yet ended', () => {
    const endsToday = makePlan({ id: '1', name: 'EndsToday', ends_on: '2026-08-12' });

    const stack = buildPlanStack([endsToday], today);

    expect(names(stack)).toEqual(['EndsToday', 'create']);
  });

  it('keeps plans with no end date regardless of today', () => {
    const openEnded = makePlan({ id: '1', name: 'Open', ends_on: null });

    const stack = buildPlanStack([openEnded], today);

    expect(names(stack)).toEqual(['Open', 'create']);
  });

  it('always appends a synthetic create page, even with no plans', () => {
    const stack = buildPlanStack([], today);

    expect(stack).toEqual([{ kind: 'create' }]);
  });
});
