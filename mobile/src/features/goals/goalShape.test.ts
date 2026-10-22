import { isGoal, isUnstarted, ownTrack } from './goalShape';

import type { CommitmentStatus, TrackRead } from './commitments';

const track: TrackRead = { weeks: [], current_streak: 0, longest_streak: 0, weeks_passed: 0, weeks_total: 1 };

describe('isGoal', () => {
  it('treats a commitment with no them as a goal', () => {
    expect(isGoal({ id: 'g1' })).toBe(true);
  });

  it('treats a commitment with them as a challenge', () => {
    expect(isGoal({ id: 'c1', them: { username: 'sam' } })).toBe(false);
  });

  it('throws on them: null rather than reading it as a goal', () => {
    expect(() => isGoal({ id: 'x1', them: null })).toThrow('x1');
  });
});

describe('ownTrack', () => {
  it("returns the goal's own track", () => {
    expect(ownTrack({ id: 'g1', you: track })).toBe(track);
  });

  it('throws when a goal arrives without you', () => {
    expect(() => ownTrack({ id: 'g1' })).toThrow('g1');
  });
});

describe('isUnstarted', () => {
  it.each<CommitmentStatus>(['sent', 'invite', 'declined', 'expired'])('treats %s as never started', (status) => {
    expect(isUnstarted({ status })).toBe(true);
  });

  it.each<CommitmentStatus>(['active', 'finished', 'ended_early'])('treats %s as started', (status) => {
    expect(isUnstarted({ status })).toBe(false);
  });
});
