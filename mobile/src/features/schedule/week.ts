import { addDays, addWeeks, getISODay, startOfWeek } from 'date-fns';

// Fixed range of +/-26 weeks around the focused date's week at mount, rather than an infinite recentering
// window -- simpler, adequate for the use case, and avoids scroll-position bugs.
export const WEEK_WINDOW = 26;
export const WEEK_OFFSETS = Array.from({ length: WEEK_WINDOW * 2 + 1 }, (_, i) => i - WEEK_WINDOW);

export function weekStartFor(anchor: Date, offset: number): Date {
  return addWeeks(startOfWeek(anchor), offset);
}

export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** The day in a Sunday-start `weekDates` week that shares `date`'s weekday. */
export function sameWeekdayIn(weekDates: Date[], date: Date): Date {
  // getISODay is Mon=1..Sun=7; mod 7 maps it onto Sunday-start column indices.
  return weekDates[getISODay(date) % 7];
}
