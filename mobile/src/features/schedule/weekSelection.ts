import { isSameDay } from 'date-fns';

import { planWindowState } from './planWindow';

/**
 * Which day Week view shows below the strip for a given visible week.
 * Prefers today if it's in the visible week -- even if that day is out of
 * the plan's window or has nothing scheduled -- otherwise the week's first
 * in-plan day, otherwise just the week's first day.
 */
export function selectedDateForWeek(
  weekDates: Date[],
  today: Date,
  planStartsOn: Date,
  planEndsOn: Date | null,
): Date {
  const todayInWeek = weekDates.find((date) => isSameDay(date, today));
  if (todayInWeek) {
    return todayInWeek;
  }
  const firstInPlan = weekDates.find((date) => planWindowState(date, planStartsOn, planEndsOn) === 'within');
  return firstInPlan ?? weekDates[0];
}
