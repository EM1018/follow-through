import { addDays, getISODay, isAfter, isSameDay } from 'date-fns';

import { formatDateOnly, parseDateOnly } from '@/lib/dates';

import type { CompletionRead } from './completions';
import { graphWindow, WINDOW_WEEKS } from './window';

export type Cell = { date: string; count: number; isToday: boolean; isFuture: boolean };

/**
 * 8 rows x 7 columns, oldest week first, Sunday first. Column is
 * `getISODay(d) % 7` -- getISODay is Monday=1..Sunday=7, so the modulo maps
 * Sunday to column 0 and Saturday to column 6. Counts are looked up per cell
 * date rather than accumulated by iterating `rows`, so rows outside this
 * grid's own 8-week window (e.g. from the list's load-more) are ignored by
 * construction, not by an extra filter.
 */
export function buildGrid(rows: CompletionRead[], today: Date): Cell[][] {
  const { from } = graphWindow(today);
  const start = parseDateOnly(from);

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.on_date, (counts.get(row.on_date) ?? 0) + 1);
  }

  const grid: Cell[][] = Array.from({ length: WINDOW_WEEKS }, () => new Array<Cell>(7));

  for (let i = 0; i < WINDOW_WEEKS * 7; i++) {
    const date = addDays(start, i);
    const dateStr = formatDateOnly(date);
    const weekIndex = Math.floor(i / 7);
    const column = getISODay(date) % 7;
    grid[weekIndex][column] = {
      date: dateStr,
      count: counts.get(dateStr) ?? 0,
      isToday: isSameDay(date, today),
      isFuture: isAfter(date, today),
    };
  }

  return grid;
}

/** Fixed scale, never relative to the data in the window -- see prompt for why. */
export function level(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) {
    return 0;
  }
  if (count === 1) {
    return 1;
  }
  if (count === 2) {
    return 2;
  }
  return 3;
}
