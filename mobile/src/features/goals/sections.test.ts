import type { CommitmentRead } from './commitments';
import { defaultExpandedId, filterSections, hasAnyChallenge, partitionCards, runningChallengeCount } from './sections';

function row(id: string, status: CommitmentRead['status']): CommitmentRead {
  return {
    id,
    status,
    activity: 'running',
    target_value: null,
    target_unit: null,
    sessions_per_week: 3,
    duration_weeks: 6,
    created_at: '2026-09-01T12:00:00Z',
  };
}

describe('partitionCards', () => {
  // The server's order: pending first in `active`, then newest first.
  const data = {
    active: [row('inv1', 'invite'), row('sent1', 'sent'), row('inv2', 'invite'), row('act1', 'active')],
    finished: [row('dec1', 'declined'), row('fin1', 'finished'), row('exp1', 'expired'), row('end1', 'ended_early')],
  };
  const ids = (rows: CommitmentRead[]) => rows.map((r) => r.id);

  it('pulls invites into their own section, in server order', () => {
    expect(ids(partitionCards(data).invites)).toEqual(['inv1', 'inv2']);
  });

  it("keeps sent in Active -- it's the viewer's own outgoing invite", () => {
    expect(ids(partitionCards(data).active)).toEqual(['sent1', 'act1']);
  });

  it('keeps declined and expired in Finished', () => {
    expect(ids(partitionCards(data).finished)).toEqual(['dec1', 'fin1', 'exp1', 'end1']);
  });

  it('has an empty Invites section when there are no invites', () => {
    expect(partitionCards({ active: [row('act1', 'active')], finished: [] }).invites).toEqual([]);
  });

  it('places every row in exactly one section', () => {
    const { invites, active, finished } = partitionCards(data);
    expect(invites.length + active.length + finished.length).toBe(data.active.length + data.finished.length);
  });
});

describe('defaultExpandedId', () => {
  it('skips unstarted rows at the top of Active to the first card with progress', () => {
    const sections = partitionCards({ active: [row('sent1', 'sent'), row('act1', 'active')], finished: [] });
    expect(defaultExpandedId(sections)).toBe('act1');
  });

  it('falls through to Finished, skipping declined/expired', () => {
    const sections = partitionCards({
      active: [row('sent1', 'sent')],
      finished: [row('dec1', 'declined'), row('fin1', 'finished')],
    });
    expect(defaultExpandedId(sections)).toBe('fin1');
  });

  it('is null when nothing has progress', () => {
    expect(defaultExpandedId(partitionCards({ active: [row('inv1', 'invite')], finished: [] }))).toBeNull();
  });
});

describe('chips', () => {
  const challenge = (id: string, status: CommitmentRead['status']): CommitmentRead => ({
    ...row(id, status),
    them: { username: 'sam' },
  });
  const ids = (rows: CommitmentRead[]) => rows.map((r) => r.id);
  const sections = partitionCards({
    active: [challenge('inv1', 'invite'), challenge('sent1', 'sent'), row('goal1', 'active'), challenge('ch1', 'active')],
    finished: [row('goal2', 'finished'), challenge('dec1', 'declined')],
  });

  describe('hasAnyChallenge', () => {
    it('is false for a user with only goals -- they never see the chips', () => {
      expect(hasAnyChallenge(partitionCards({ active: [row('g1', 'active')], finished: [row('g2', 'finished')] }))).toBe(
        false,
      );
    });

    it('is false with nothing at all', () => {
      expect(hasAnyChallenge(partitionCards({ active: [], finished: [] }))).toBe(false);
    });

    it('is true once any challenge exists -- even a lone invite', () => {
      expect(hasAnyChallenge(partitionCards({ active: [challenge('inv1', 'invite')], finished: [] }))).toBe(true);
    });
  });

  describe('filterSections', () => {
    it('All leaves every section as it is', () => {
      expect(filterSections(sections, 'all')).toBe(sections);
    });

    it('Solo keeps only goals, in both Active and Finished, and hides Invites entirely', () => {
      const solo = filterSections(sections, 'solo');
      expect(solo.invites).toEqual([]);
      expect(ids(solo.active)).toEqual(['goal1']);
      expect(ids(solo.finished)).toEqual(['goal2']);
    });

    it('Friends keeps only challenges, in every section', () => {
      const friends = filterSections(sections, 'friends');
      expect(ids(friends.invites)).toEqual(['inv1']);
      expect(ids(friends.active)).toEqual(['sent1', 'ch1']);
      expect(ids(friends.finished)).toEqual(['dec1']);
    });
  });
});

describe('runningChallengeCount', () => {
  const challenge = (id: string, status: CommitmentRead['status']): CommitmentRead => ({
    ...row(id, status),
    them: { username: 'sam' },
  });

  it('counts only challenges with status active -- as the server counts them for the cap', () => {
    const sections = partitionCards({
      active: [
        challenge('inv1', 'invite'),
        challenge('sent1', 'sent'),
        challenge('ch1', 'active'),
        challenge('ch2', 'active'),
        row('goal1', 'active'),
      ],
      finished: [challenge('fin1', 'finished'), challenge('end1', 'ended_early'), challenge('dec1', 'declined')],
    });
    expect(runningChallengeCount(sections)).toBe(2);
  });
});
