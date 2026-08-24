import { isPlanListEmpty, selectOrderedPlans, type PlanRead } from './planStack';

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

function names(plans: PlanRead[]): string[] {
  return plans.map((plan) => plan.name);
}

describe('selectOrderedPlans', () => {
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

    const ordered = selectOrderedPlans([oldest, active, newest], today);

    expect(names(ordered)).toEqual(['Active', 'Newest', 'Oldest']);
  });

  it('drops plans that ended before today', () => {
    const ended = makePlan({ id: '1', name: 'Ended', ends_on: '2026-08-11' });
    const ongoing = makePlan({ id: '2', name: 'Ongoing', ends_on: '2026-08-13' });

    const ordered = selectOrderedPlans([ended, ongoing], today);

    expect(names(ordered)).toEqual(['Ongoing']);
  });

  it('treats a plan ending exactly today as not yet ended', () => {
    const endsToday = makePlan({ id: '1', name: 'EndsToday', ends_on: '2026-08-12' });

    const ordered = selectOrderedPlans([endsToday], today);

    expect(names(ordered)).toEqual(['EndsToday']);
  });

  it('keeps plans with no end date regardless of today', () => {
    const openEnded = makePlan({ id: '1', name: 'Open', ends_on: null });

    const ordered = selectOrderedPlans([openEnded], today);

    expect(names(ordered)).toEqual(['Open']);
  });

  it('returns an empty list when there are no plans', () => {
    expect(selectOrderedPlans([], today)).toEqual([]);
  });
});

describe('isPlanListEmpty', () => {
  it('is false while the plans query has not yet resolved', () => {
    expect(isPlanListEmpty(undefined, [])).toBe(false);
  });

  it('is false once plans have loaded and the filtered list has entries', () => {
    const plan = makePlan({ id: '1' });
    expect(isPlanListEmpty([plan], [plan])).toBe(false);
  });

  it('is true when the filtered list is empty even though the raw response is not -- e.g. every plan has ended', () => {
    const ended = makePlan({ id: '1', ends_on: '2026-01-01' });
    expect(isPlanListEmpty([ended], [])).toBe(true);
  });

  it('is true once plans have loaded and there truly are none', () => {
    expect(isPlanListEmpty([], [])).toBe(true);
  });
});
