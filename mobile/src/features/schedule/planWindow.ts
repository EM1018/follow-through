import { isAfter, isBefore } from 'date-fns';

export type PlanWindowState = 'before' | 'within' | 'after';

/**
 * Where `date` falls relative to a plan's own life span. Both bounds are
 * inclusive -- a date equal to `starts` or `ends` is `within`. `ends` is
 * nullable: a plan with no end date is never `after`.
 *
 * Mirrors the backend's `date_within_plan_window` (app/services/resolution.py)
 * one-to-one, just split into three states instead of a boolean.
 */
export function planWindowState(date: Date, starts: Date, ends: Date | null): PlanWindowState {
  if (isBefore(date, starts)) {
    return 'before';
  }
  if (ends !== null && isAfter(date, ends)) {
    return 'after';
  }
  return 'within';
}
