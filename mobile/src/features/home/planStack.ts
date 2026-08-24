import { isBefore } from 'date-fns';

import type { components } from '@/api/schema';
import { parseDateOnly } from '@/lib/dates';

export type PlanRead = components['schemas']['PlanRead'];

function hasEnded(plan: PlanRead, today: Date): boolean {
  if (!plan.ends_on) {
    return false;
  }
  return isBefore(parseDateOnly(plan.ends_on), today);
}

/**
 * Active plan first, then the rest newest-created first. Plans that ended
 * before `today` are dropped entirely. Shared by the plan stack and the
 * header's plan switcher so both list the same plans in the same order.
 */
export function selectOrderedPlans(plans: PlanRead[], today: Date): PlanRead[] {
  const current = plans.filter((plan) => !hasEnded(plan, today));

  return [...current].sort((a, b) => {
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * True once the plans query has resolved and the *filtered* list came back
 * empty -- a plan that only just ended still counts as "no plans" here, even
 * though the raw API response isn't empty.
 */
export function isPlanListEmpty(rawPlans: PlanRead[] | undefined, orderedPlans: PlanRead[]): boolean {
  return rawPlans !== undefined && orderedPlans.length === 0;
}
