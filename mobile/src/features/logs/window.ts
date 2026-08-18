import { addWeeks, startOfWeek, subDays, subWeeks } from 'date-fns';

import { formatDateOnly, parseDateOnly } from '@/lib/dates';

export const WINDOW_WEEKS = 8;

export type DateRange = { from: string; to: string };

/** 8 whole week rows (Sunday-start), ending with today's own partial week. Feeds both the list's initial page and the graph grid. */
export function graphWindow(today: Date): DateRange {
  const from = addWeeks(startOfWeek(today), -(WINDOW_WEEKS - 1));
  return { from: formatDateOnly(from), to: formatDateOnly(today) };
}

/**
 * The next "load more" page: an earlier, disjoint range immediately before
 * `currentFrom`. Ranges never overlap, so pages appended from repeated calls
 * never need de-duplication.
 */
export function earlierWindow(currentFrom: string): DateRange {
  const to = subDays(parseDateOnly(currentFrom), 1);
  const from = subWeeks(to, WINDOW_WEEKS);
  return { from: formatDateOnly(from), to: formatDateOnly(to) };
}
