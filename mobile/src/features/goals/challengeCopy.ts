import { differenceInCalendarDays, parseISO } from 'date-fns';

import type { UnstartedStatus } from './goalShape';

/** "1 week", "6 weeks" -- an unstarted challenge's terms carry its length, since that's what's being agreed to. */
export function durationLabel(weeks: number): string {
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

/** The small pill on an unstarted challenge card. */
export const UNSTARTED_BADGE: Record<UnstartedStatus, string> = {
  sent: 'Sent',
  invite: 'Invite',
  declined: 'Declined',
  expired: 'Expired',
};

/**
 * The line that frames an unstarted challenge. sent and invite are the same
 * row seen from either side -- only this line (and the actions) differ.
 */
export function unstartedLine(status: UnstartedStatus, themLabel: string): string {
  switch (status) {
    case 'sent':
      return `Waiting for ${themLabel}`;
    case 'invite':
      return `${themLabel} challenged you`;
    case 'declined':
      return `${themLabel} declined`;
    case 'expired':
      return `${themLabel} didn't respond in time`;
  }
}

/**
 * Mirrors the backend's INVITE_LIVE_DAYS for display only -- the server's
 * status is what decides whether an invite is live, never this number.
 */
const INVITE_LIVE_DAYS = 14;

/**
 * Whole days left to answer an invite after today: 0 on its last day. The
 * server counts from created_at's UTC calendar date against the viewer's own
 * today (live through day 13), so the sent day here is the UTC date too --
 * reading it in local time would put the countdown a day off for anyone
 * west of UTC. Never negative: if the server still says invite, it's live.
 */
export function inviteDaysLeft(createdAt: string, today: Date): number {
  const sentAt = parseISO(createdAt);
  const sentDay = new Date(sentAt.getUTCFullYear(), sentAt.getUTCMonth(), sentAt.getUTCDate());
  const elapsed = differenceInCalendarDays(today, sentDay);
  return Math.max(0, INVITE_LIVE_DAYS - 1 - elapsed);
}

export function inviteCountdownLabel(daysLeft: number): string {
  if (daysLeft === 0) {
    return 'Last day to respond';
  }
  return daysLeft === 1 ? '1 day left to respond' : `${daysLeft} days left to respond`;
}

/**
 * Mirrors the backend's CHALLENGE_CAP for display only. The server re-checks
 * on every accept regardless -- the count can change between render and tap.
 */
export const CHALLENGE_CAP = 5;

export const CHALLENGE_CAP_LINE = `You have ${CHALLENGE_CAP} challenges running. Finish or quit one to accept another.`;

export type ChallengeAction = 'accept' | 'decline' | 'withdraw' | 'dismiss' | 'quit';

const FALLBACK_TITLE: Record<ChallengeAction, string> = {
  accept: "Couldn't accept this challenge.",
  decline: "Couldn't decline this challenge.",
  withdraw: "Couldn't withdraw this invite.",
  dismiss: "Couldn't dismiss this.",
  quit: "Couldn't quit this challenge.",
};

/**
 * What to tell the viewer when a challenge action fails. These are two-sided:
 * the other participant may have acted first, and the server says how via
 * a distinct code -- so this names what happened rather than "try again".
 * null means say nothing: the failure already is the outcome they wanted
 * (a withdraw or dismiss of a row that's already gone), and the refetch
 * that follows every failure just catches the list up.
 */
export function challengeActionError(
  action: ChallengeAction,
  error: { kind: string; code?: string },
  themLabel: string,
): { title: string; message: string } | null {
  const withdrawn = { title: 'Invite no longer available', message: `${themLabel} withdrew this invite.` };
  const answered = { title: 'Already answered', message: 'This invite was already answered, maybe from another device.' };

  switch (action) {
    case 'accept':
      if (error.kind === 'not_found') return withdrawn;
      if (error.code === 'invite_not_pending') return answered;
      if (error.code === 'invite_expired') return { title: 'Invite expired', message: 'This invite expired before it was accepted.' };
      if (error.code === 'challenge_cap_reached') return { title: 'Too many challenges', message: CHALLENGE_CAP_LINE };
      break;
    case 'decline':
      if (error.kind === 'not_found') return withdrawn;
      if (error.code === 'invite_not_pending') return answered;
      break;
    case 'withdraw':
      if (error.code === 'challenge_already_accepted') {
        return { title: 'Already accepted', message: `${themLabel} already accepted. The challenge is running now.` };
      }
      if (error.kind === 'not_found') return null;
      break;
    case 'dismiss':
      if (error.kind === 'not_found') return null;
      break;
    case 'quit':
      if (error.code === 'challenge_not_active') {
        return { title: 'Challenge already over', message: 'This challenge has already ended.' };
      }
      if (error.kind === 'not_found') return { title: 'Challenge not found', message: 'This challenge no longer exists.' };
      break;
  }
  return { title: FALLBACK_TITLE[action], message: 'Try again.' };
}

export const QUIT_CONFIRM_TITLE = 'Quit this challenge?';

export function quitConfirmMessage(themLabel: string): string {
  return `This ends the challenge for both you and ${themLabel}. It can't be undone.`;
}
