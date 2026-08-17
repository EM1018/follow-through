import { format, parseISO } from 'date-fns';

/**
 * Parse a date-only string (e.g. "2026-08-11") as local midnight.
 *
 * `new Date("2026-08-11")` parses as UTC midnight, which renders as the
 * previous day in any negative-offset timezone -- never use the Date
 * constructor directly on a date-only string.
 */
export function parseDateOnly(value: string): Date {
  return parseISO(value);
}

/** Format a Date as a date-only string for `from`/`to` query params. Never toISOString(). */
export function formatDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
