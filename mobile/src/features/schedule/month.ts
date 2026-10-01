import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

// Fixed range of +/-24 months around the focused date's month at mount, same rationale as Day/Week's fixed windows.
export const MONTH_WINDOW = 24;
export const MONTH_OFFSETS = Array.from({ length: MONTH_WINDOW * 2 + 1 }, (_, i) => i - MONTH_WINDOW);

export function monthStartFor(anchor: Date, offset: number): Date {
  return startOfMonth(addMonths(anchor, offset));
}

/**
 * `date`'s day-of-month carried into `monthStart`'s month, clamped to its length
 * (Jan 31 -> Feb 28). Accepted as lossy: paging back from there gives Jan 28.
 */
export function sameDayOfMonthIn(monthStart: Date, date: Date): Date {
  return addMonths(date, differenceInCalendarMonths(monthStart, date));
}

/** A month spans at most six Sunday-start weeks; the grid always reserves this many rows so its height never changes. */
export const MAX_GRID_ROWS = 6;

export type MonthCell = { date: Date; inMonth: boolean };

/** Full 7-wide grid for the month, including dimmed leading/trailing days from adjacent months. */
export function monthGrid(monthStart: Date): MonthCell[] {
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(endOfMonth(monthStart));
  const totalDays = differenceInCalendarDays(gridEnd, gridStart) + 1;

  return Array.from({ length: totalDays }, (_, i) => {
    const date = addDays(gridStart, i);
    return { date, inMonth: date.getMonth() === monthStart.getMonth() };
  });
}
