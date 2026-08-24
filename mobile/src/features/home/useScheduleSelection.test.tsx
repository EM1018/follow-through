import renderer, { act } from 'react-test-renderer';

import type { PlanRead } from './planStack';
import { resolveCurrentPlanId, useScheduleSelection } from './useScheduleSelection';

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

describe('resolveCurrentPlanId', () => {
  it('picks the active plan on cold launch', () => {
    const active = makePlan({ id: 'active', is_active: true });
    const other = makePlan({ id: 'other' });
    // Ordered active-first, as selectOrderedPlans would produce.
    expect(resolveCurrentPlanId([active, other], null)).toBe('active');
  });

  it('falls back to the first plan in the ordered list when none is active', () => {
    const first = makePlan({ id: 'first' });
    const second = makePlan({ id: 'second' });
    expect(resolveCurrentPlanId([first, second], null)).toBe('first');
  });

  it('falls back to the active-or-first plan when the previous selection no longer exists', () => {
    const active = makePlan({ id: 'active', is_active: true });
    expect(resolveCurrentPlanId([active], 'deleted-plan')).toBe('active');
  });

  it('keeps the selection when it is still present in the ordered list', () => {
    const active = makePlan({ id: 'active', is_active: true });
    const other = makePlan({ id: 'other' });
    expect(resolveCurrentPlanId([active, other], 'other')).toBe('other');
  });
});

describe('useScheduleSelection', () => {
  type Result = ReturnType<typeof useScheduleSelection>;

  function Harness({ plans, today, onResult }: { plans: PlanRead[]; today: Date; onResult: (r: Result) => void }) {
    onResult(useScheduleSelection(plans, today));
    return null;
  }

  it('switching plans keeps the focused date instead of resetting it', () => {
    const planA = makePlan({ id: 'a', is_active: true });
    const planB = makePlan({ id: 'b' });
    const today = new Date(2026, 7, 12);
    const laterDate = new Date(2026, 7, 20);

    let latest!: Result;
    act(() => {
      renderer.create(<Harness plans={[planA, planB]} today={today} onResult={(r) => (latest = r)} />);
    });

    expect(latest.currentPlan?.id).toBe('a');

    act(() => {
      latest.setFocusedDate(laterDate);
    });
    expect(latest.focusedDate).toEqual(laterDate);

    act(() => {
      latest.selectPlan('b');
    });
    expect(latest.currentPlan?.id).toBe('b');
    expect(latest.focusedDate).toEqual(laterDate);
  });
});
