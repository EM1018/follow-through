import type { TrackRead, WeekRead } from './commitments';

const ONGOING_CIRCLE_CAP = 4;

/**
 * How one week draws. The track only lists weeks that have started, so
 * 'missed' only ever means a week that closed short, never one that hasn't
 * happened yet. 'upcoming' is never read off a week -- it's only padded on by
 * spanCircles(), for weeks the track says exist (weeks_total) but hasn't
 * reached.
 */
export type WeekCircle = 'met' | 'in_progress' | 'missed' | 'upcoming';

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

/**
 * A track's whole span: its reached weeks, then one 'upcoming' per week still
 * to come. Only challenge rows use this -- a goal's row still stops at the
 * current week (circlesFor). An ended challenge's weeks_total already stops
 * at its last full week, so nothing after a quit pads as upcoming.
 */
export function spanCircles(track: TrackRead): WeekCircle[] {
  const reached = track.weeks.map(weekCircle);
  const upcoming = Array.from({ length: track.weeks_total - reached.length }, (): WeekCircle => 'upcoming');
  return [...reached, ...upcoming];
}

/**
 * Both rows of a challenge card, column for column. The server builds both
 * tracks over one set of week boundaries, so their spans always match; if
 * they ever don't, the rows can't line up and the card would misstate who
 * did what in which week -- so it throws rather than drawing them.
 */
export function challengeRows(you: TrackRead, them: TrackRead): { you: WeekCircle[]; them: WeekCircle[] } {
  if (you.weeks_total !== them.weeks_total) {
    throw new Error(`Challenge tracks disagree on weeks_total (${you.weeks_total} vs ${them.weeks_total})`);
  }
  return { you: spanCircles(you), them: spanCircles(them) };
}
