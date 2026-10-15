import { format } from 'date-fns';

import { parseDateOnly } from '@/lib/dates';

import type { CommitmentRead } from './commitments';

export const EMPTY_GOALS_TITLE = 'Your goals show up here';
// This line is doing real work: it teaches that goals are fed passively by
// what's already being logged -- the one thing a new user can't guess.
export const EMPTY_GOALS_SUBTITLE =
  'Pick an activity and how often. Anything you log counts toward it automatically.';
export const NEW_GOAL_BUTTON_LABEL = 'New goal';

/** A challenge card's top row -- always the viewer's; the server already orients the response. */
export const CHALLENGE_YOU_LABEL = 'You';
// The server reads the other participant's username live on every request,
// and they can clear it after the challenge was sent -- null is a real state.
export const CHALLENGE_UNNAMED_LABEL = 'Friend';

export function challengeThemLabel(username: string | null): string {
  return username ?? CHALLENGE_UNNAMED_LABEL;
}

/**
 * Finished-card header for a goal or challenge that ended early -- in place
 * of finishedWeekLabel()'s "Week 6 of 6", which would claim it ran its full term.
 */
export const ENDED_EARLY_HEADER = 'Ended early';

/**
 * "You ended this on Sep 14" / "sam ended this on Sep 14". ended_by is
 * already oriented by the server (you/them), so this never compares ids.
 * Both fields are always sent on an ended_early row; missing either is a
 * contract break, so it throws instead of guessing who quit. A goal has no
 * other participant (themLabel null) and the server always sends it as
 * ended_by: you -- 'them' on one is a contract break too.
 */
export function endedEarlyLine(
  commitment: Pick<CommitmentRead, 'id' | 'ended_by' | 'ended_on'>,
  themLabel: string | null,
): string {
  if (commitment.ended_by == null || commitment.ended_on == null) {
    throw new Error(`Commitment ${commitment.id} is ended_early without ended_by/ended_on`);
  }
  if (commitment.ended_by === 'them' && themLabel === null) {
    throw new Error(`Commitment ${commitment.id} says them ended it, but has no other participant`);
  }
  const who = commitment.ended_by === 'you' ? CHALLENGE_YOU_LABEL : themLabel;
  return `${who} ended this on ${format(parseDateOnly(commitment.ended_on), 'MMM d')}`;
}
