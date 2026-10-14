import type { WeekRead } from './commitments';

const ONGOING_CIRCLE_CAP = 4;

/**
 * How one reached week draws. A week still to come has no circle at all --
 * the track only lists weeks that have started -- so 'missed' only ever
 * means a week that closed short, never one that hasn't happened yet.
 */
export type WeekCircle = 'met' | 'in_progress' | 'missed';

/** Read straight off the server's flags -- a met current week arrives as met, not in_progress. */
export function weekCircle(week: WeekRead): WeekCircle {
  if (week.met) {
    return 'met';
  }
  return week.in_progress ? 'in_progress' : 'missed';
}

/**
 * Weeks are already ordered oldest-to-newest and capped at 8 by the API.
 * Ongoing goals only ever show the most recent 4 (there's no fixed end to
 * anchor a longer row to); a fixed-length goal shows every week it has,
 * which is never more than 8 since duration_weeks itself is capped there.
 */
export function circlesFor(weeks: WeekRead[], durationWeeks: number | null): WeekCircle[] {
  const circles = weeks.map(weekCircle);
  return durationWeeks === null ? circles.slice(-ONGOING_CIRCLE_CAP) : circles;
}
