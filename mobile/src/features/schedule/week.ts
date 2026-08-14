import { addDays, addWeeks, startOfWeek } from 'date-fns';

// Fixed range of +/-26 weeks around today, rather than an infinite recentering
// window -- simpler, adequate for the use case, and avoids scroll-position bugs.
export const WEEK_WINDOW = 26;
export const WEEK_OFFSETS = Array.from({ length: WEEK_WINDOW * 2 + 1 }, (_, i) => i - WEEK_WINDOW);

export function weekStartFor(today: Date, offset: number): Date {
  return addWeeks(startOfWeek(today), offset);
}

export function weekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
