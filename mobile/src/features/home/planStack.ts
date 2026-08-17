import { isBefore } from 'date-fns';

import type { components } from '@/api/schema';
import { parseDateOnly } from '@/lib/dates';

export type PlanRead = components['schemas']['PlanRead'];

export type PlanStackItem = { kind: 'plan'; plan: PlanRead } | { kind: 'create' };

function hasEnded(plan: PlanRead, today: Date): boolean {
  if (!plan.ends_on) {
    return false;
  }
  return isBefore(parseDateOnly(plan.ends_on), today);
}

/**
 * Active plan first, then the rest newest-created first, with a synthetic
 * "create plan" page appended at the end. Plans that ended before `today`
 * are dropped entirely.
 */
export function buildPlanStack(plans: PlanRead[], today: Date): PlanStackItem[] {
  const current = plans.filter((plan) => !hasEnded(plan, today));

  const sorted = [...current].sort((a, b) => {
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return [...sorted.map((plan): PlanStackItem => ({ kind: 'plan', plan })), { kind: 'create' }];
}
