import { entriesForWorkout, WEEKDAY_NAMES, type ScheduleEntry } from './blastRadius';

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * "Every Monday and Thursday" when every row for this workout is a plain
 * recurring weekday (at most 2 distinct weekdays); otherwise a row count.
 * Never expands recurrence into actual calendar-day counts.
 */
export function scheduledDaysSummary(entries: ScheduleEntry[], workoutId: string): string {
  const direct = entriesForWorkout(entries, workoutId);
  if (direct.length === 0) {
    return 'Not scheduled';
  }

  const allRecurring = direct.every((entry) => entry.day_of_week !== null);
  const uniqueDays = Array.from(new Set(direct.map((entry) => entry.day_of_week)));

  if (allRecurring && uniqueDays.length <= 2) {
    const sorted = [...uniqueDays].sort((a, b) => (a as number) - (b as number));
    const names = sorted.map((day) => WEEKDAY_NAMES[day as number]);
    return `Every ${joinWithAnd(names)}`;
  }

  const noun = direct.length === 1 ? 'day' : 'days';
  return `${direct.length} scheduled ${noun}`;
}
