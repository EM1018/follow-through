import { format, isSameDay, parseISO, subDays } from 'date-fns';

import { parseDateOnly } from '@/lib/dates';

import type { CompletionRead } from './completions';

export type LogSection = { date: string; rows: CompletionRead[] };

/** Sorted by on_date desc, then created_at desc -- the server's ordering is never relied on. */
export function groupByDate(rows: CompletionRead[]): LogSection[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.on_date !== b.on_date) {
      return a.on_date < b.on_date ? 1 : -1;
    }
    return parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime();
  });

  const sections: LogSection[] = [];
  for (const row of sorted) {
    const current = sections[sections.length - 1];
    if (current && current.date === row.on_date) {
      current.rows.push(row);
    } else {
      sections.push({ date: row.on_date, rows: [row] });
    }
  }
  return sections;
}

export function sectionLabel(date: string, today: Date): string {
  const parsed = parseDateOnly(date);
  if (isSameDay(parsed, today)) {
    return 'Today';
  }
  if (isSameDay(parsed, subDays(today, 1))) {
    return 'Yesterday';
  }
  return format(parsed, 'EEEE, MMMM d');
}
