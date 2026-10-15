import { parseDateOnly } from '@/lib/dates';

import {
  CHALLENGE_CAP_LINE,
  challengeActionError,
  durationLabel,
  inviteCountdownLabel,
  inviteDaysLeft,
  quitConfirmMessage,
  unstartedLine,
} from './challengeCopy';

describe('durationLabel', () => {
  it('is singular for one week and plural otherwise', () => {
    expect(durationLabel(1)).toBe('1 week');
    expect(durationLabel(6)).toBe('6 weeks');
  });
});

describe('unstartedLine', () => {
  it('frames each unstarted state from the viewer side the server oriented it to', () => {
    expect(unstartedLine('sent', 'sam')).toBe('Waiting for sam');
    expect(unstartedLine('invite', 'sam')).toBe('sam challenged you');
    expect(unstartedLine('declined', 'sam')).toBe('sam declined');
    expect(unstartedLine('expired', 'sam')).toBe("sam didn't respond in time");
  });
});

describe('inviteDaysLeft', () => {
  const sent = '2026-09-01T15:00:00Z';

  it('has 13 days left after the day it was sent', () => {
    expect(inviteDaysLeft(sent, parseDateOnly('2026-09-01'))).toBe(13);
  });

  it("is 0 on day 13 -- the server's last live day", () => {
    expect(inviteDaysLeft(sent, parseDateOnly('2026-09-14'))).toBe(0);
  });

  it('never goes negative -- if the server still says invite, the card still shows it as live', () => {
    expect(inviteDaysLeft(sent, parseDateOnly('2026-09-20'))).toBe(0);
  });

  it("counts from created_at's UTC date, as the server does, not the local one", () => {
    // 02:00 UTC on Sep 2 is still Sep 1 anywhere west of UTC-2; the server calls it Sep 2.
    expect(inviteDaysLeft('2026-09-02T02:00:00Z', parseDateOnly('2026-09-02'))).toBe(13);
  });
});

describe('inviteCountdownLabel', () => {
  it('reads as a last-day warning at 0, then singular, then plural', () => {
    expect(inviteCountdownLabel(0)).toBe('Last day to respond');
    expect(inviteCountdownLabel(1)).toBe('1 day left to respond');
    expect(inviteCountdownLabel(9)).toBe('9 days left to respond');
  });
});

describe('challengeActionError', () => {
  const conflict = (code: string) => ({ kind: 'conflict', code });

  it.each([
    ['accept', { kind: 'not_found', code: 'invite_unavailable' }, 'sam withdrew this invite.'],
    ['accept', conflict('invite_not_pending'), 'This invite was already answered, maybe from another device.'],
    ['accept', conflict('invite_expired'), 'This invite expired before it was accepted.'],
    ['accept', conflict('challenge_cap_reached'), CHALLENGE_CAP_LINE],
    ['decline', { kind: 'not_found', code: 'invite_unavailable' }, 'sam withdrew this invite.'],
    ['decline', conflict('invite_not_pending'), 'This invite was already answered, maybe from another device.'],
    ['withdraw', conflict('challenge_already_accepted'), 'sam already accepted. The challenge is running now.'],
    ['quit', conflict('challenge_not_active'), 'This challenge has already ended.'],
    ['quit', { kind: 'not_found' }, 'This challenge no longer exists.'],
  ] as const)('%s failing with %j says what happened', (action, error, message) => {
    expect(challengeActionError(action, error, 'sam')?.message).toBe(message);
  });

  it('says nothing when a withdraw or dismiss finds the row already gone -- that was the goal', () => {
    expect(challengeActionError('withdraw', { kind: 'not_found' }, 'sam')).toBeNull();
    expect(challengeActionError('dismiss', { kind: 'not_found' }, 'sam')).toBeNull();
  });

  it('falls back to a per-action "Try again." for anything unrecognised', () => {
    expect(challengeActionError('accept', { kind: 'network' }, 'sam')).toEqual({
      title: "Couldn't accept this challenge.",
      message: 'Try again.',
    });
  });
});

describe('quitConfirmMessage', () => {
  it('says it ends the challenge for both participants and is permanent', () => {
    expect(quitConfirmMessage('sam')).toBe("This ends the challenge for both you and sam. It can't be undone.");
  });
});
