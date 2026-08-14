import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

// Fixed range of +/-24 months around today, same rationale as Day/Week's fixed windows.
export const MONTH_WINDOW = 24;
export const MONTH_OFFSETS = Array.from({ length: MONTH_WINDOW * 2 + 1 }, (_, i) => i - MONTH_WINDOW);

export function monthStartFor(today: Date, offset: number): Date {
  return startOfMonth(addMonths(today, offset));
}

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
