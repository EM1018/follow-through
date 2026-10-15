import { challengeRows, circlesFor, spanCircles, type WeekCircle } from './circles';

import type { TrackRead, WeekRead } from './commitments';

function week(circle: WeekCircle, index: number): WeekRead {
  return {
    index,
    sessions_done: circle === 'met' ? 3 : 0,
    met: circle === 'met',
    in_progress: circle === 'in_progress',
  };
}

describe('circlesFor', () => {
  it('maps met/missed/in_progress weeks to their matching circles, in order', () => {
    const weeks = [week('met', 0), week('missed', 1), week('in_progress', 2)];
    expect(circlesFor(weeks, null)).toEqual(['met', 'missed', 'in_progress']);
  });

  it('draws a week that closed short as missed', () => {
    expect(circlesFor([{ index: 0, sessions_done: 1, met: false, in_progress: false }], 2)).toEqual(['missed']);
  });

  it('draws nothing for weeks not yet reached, rather than drawing them as missed', () => {
    // A 6-week goal in its second week: the track lists two weeks, so two circles.
    const circles = circlesFor([week('met', 0), week('in_progress', 1)], 6);
    expect(circles).toEqual(['met', 'in_progress']);
  });

  it('caps an ongoing goal at the 4 most recent circles', () => {
    const weeks = Array.from({ length: 8 }, (_, i) => week('met', i));
    const circles = circlesFor(weeks, null);
    expect(circles).toHaveLength(4);
  });

  it('renders every week for a 6-week fixed-length goal', () => {
    const weeks = Array.from({ length: 6 }, (_, i) => week('met', i));
    const circles = circlesFor(weeks, 6);
    expect(circles).toHaveLength(6);
  });

  it('does not cap a fixed-length goal even though it happens to have 8 weeks', () => {
    const weeks = Array.from({ length: 8 }, (_, i) => week('met', i));
    expect(circlesFor(weeks, 8)).toHaveLength(8);
  });
});

function track(weeks: WeekRead[], weeksTotal: number): TrackRead {
  return { weeks, weeks_total: weeksTotal, weeks_passed: 0, current_streak: 0, longest_streak: 0 };
}

describe('spanCircles', () => {
  it('pads the weeks not yet reached as upcoming, never as missed', () => {
    expect(spanCircles(track([week('met', 0), week('in_progress', 1)], 4))).toEqual([
      'met',
      'in_progress',
      'upcoming',
      'upcoming',
    ]);
  });

  it('pads nothing once every week is reached', () => {
    expect(spanCircles(track([week('met', 0), week('missed', 1)], 2))).toEqual(['met', 'missed']);
  });
});

describe('challengeRows', () => {
  it('renders a newly accepted 6-week challenge as mostly upcoming on both rows, not mostly missed', () => {
    const rows = challengeRows(track([week('in_progress', 0)], 6), track([week('in_progress', 0)], 6));
    const expected: WeekCircle[] = ['in_progress', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'];
    expect(rows.you).toEqual(expected);
    expect(rows.them).toEqual(expected);
  });

  it('lines both rows up column for column', () => {
    const rows = challengeRows(
      track([week('met', 0), week('in_progress', 1)], 4),
      track([week('missed', 0), week('met', 1)], 4),
    );
    expect(rows.you).toEqual(['met', 'in_progress', 'upcoming', 'upcoming']);
    expect(rows.them).toEqual(['missed', 'met', 'upcoming', 'upcoming']);
  });

  it('throws when the two tracks disagree on their span, rather than drawing misaligned rows', () => {
    expect(() => challengeRows(track([], 6), track([], 5))).toThrow('weeks_total');
  });
});
