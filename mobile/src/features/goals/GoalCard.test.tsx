import { StyleSheet, Text } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { colors } from '@/theme';

import type { WeekCircle } from './circles';
import type { CommitmentRead, TrackRead, WeekRead } from './commitments';
import { GoalCard } from './GoalCard';
import { GoalCircles } from './GoalCircles';

function week(index: number, circle: Exclude<WeekCircle, 'upcoming'>): WeekRead {
  return { index, sessions_done: circle === 'met' ? 3 : 1, met: circle === 'met', in_progress: circle === 'in_progress' };
}

function track(weeks: WeekRead[], weeksTotal: number): TrackRead {
  return { weeks, weeks_total: weeksTotal, weeks_passed: 0, current_streak: 0, longest_streak: 0 };
}

/** A goal as the server sends it: no `them`, no ended_* fields -- absent, not null. */
function goal(overrides: Partial<CommitmentRead> = {}): CommitmentRead {
  return {
    id: 'g1',
    status: 'active',
    activity: 'running',
    target_value: null,
    target_unit: null,
    sessions_per_week: 3,
    duration_weeks: 6,
    created_at: '2026-09-01T12:00:00Z',
    starts_on: '2026-09-01',
    you: track([week(0, 'met'), week(1, 'in_progress')], 6),
    ...overrides,
  };
}

// One underlying challenge between alex (creator) and sam (recipient), two
// weeks into six. alex met week 1 and is mid-week 2; sam missed week 1 and
// already met week 2. The server orients it per viewer -- these two
// fixtures are exactly what each of them is sent.
const alexTrack = track([week(0, 'met'), week(1, 'in_progress')], 6);
const samTrack = track([week(0, 'missed'), week(1, 'met')], 6);

function challenge(overrides: Partial<CommitmentRead> = {}): CommitmentRead {
  return goal({ id: 'c1', you: alexTrack, them: { username: 'sam', track: samTrack }, ...overrides });
}
const asCreator = challenge();
const asRecipient = challenge({ you: samTrack, them: { username: 'alex', track: alexTrack } });

function render(commitment: CommitmentRead, variant: 'active' | 'finished' = 'active', expanded = true) {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <GoalCard
        commitment={commitment}
        variant={variant}
        activityDisplayName="Running"
        expanded={expanded}
        onPress={jest.fn()}
      />,
    );
  });
  return tree!.root;
}

function rowsOf(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll((n) => typeof n.type === 'string' && /^challenge-track-/.test(n.props.testID ?? ''));
}

function labelOf(row: ReactTestInstance): string {
  return row.findByType(Text).props.children;
}

function circlesOf(row: ReactTestInstance): WeekCircle[] {
  return row.findByType(GoalCircles).props.statuses;
}

/** The flattened style of each drawn circle, in column order. */
function circleStylesOf(row: ReactTestInstance) {
  return row
    .findByType(GoalCircles)
    .findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderRadius !== undefined)
    .map((n) => StyleSheet.flatten(n.props.style));
}

function allText(root: ReactTestInstance): string[] {
  return root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}

describe('GoalCard rows', () => {
  it('renders a goal as a single row, exactly as before -- no challenge rows, no upcoming padding', () => {
    const root = render(goal());
    expect(rowsOf(root)).toHaveLength(0);
    const circles = root.findAllByType(GoalCircles);
    expect(circles).toHaveLength(1);
    expect(circles[0].props.statuses).toEqual(['met', 'in_progress']);
  });

  it('renders an active challenge as two rows, you then them, over the same six columns', () => {
    const rows = rowsOf(render(asCreator));
    expect(rows.map((r) => r.props.testID)).toEqual(['challenge-track-you', 'challenge-track-them']);
    expect(rows.map(labelOf)).toEqual(['You', 'sam']);
    expect(circlesOf(rows[0])).toHaveLength(6);
    expect(circlesOf(rows[1])).toHaveLength(6);
  });

  it("puts the viewer on top in the creator's view", () => {
    const [top, bottom] = rowsOf(render(asCreator));
    expect([labelOf(top), circlesOf(top)]).toEqual(['You', ['met', 'in_progress', 'upcoming', 'upcoming', 'upcoming', 'upcoming']]);
    expect([labelOf(bottom), circlesOf(bottom)]).toEqual(['sam', ['missed', 'met', 'upcoming', 'upcoming', 'upcoming', 'upcoming']]);
  });

  it("puts the viewer on top in the recipient's view of the same challenge", () => {
    const [top, bottom] = rowsOf(render(asRecipient));
    expect([labelOf(top), circlesOf(top)]).toEqual(['You', ['missed', 'met', 'upcoming', 'upcoming', 'upcoming', 'upcoming']]);
    expect([labelOf(bottom), circlesOf(bottom)]).toEqual(['alex', ['met', 'in_progress', 'upcoming', 'upcoming', 'upcoming', 'upcoming']]);
  });

  it('draws unreached weeks differently from missed ones, on both rows', () => {
    const rows = rowsOf(render(asCreator));
    // sam's row: week 1 missed, weeks 3-6 unreached. alex's row: weeks 3-6 unreached.
    const sam = circleStylesOf(rows[1]);
    const alex = circleStylesOf(rows[0]);

    const missed = sam[0];
    const upcoming = sam[2];
    expect(missed).toMatchObject({ borderWidth: 1, borderColor: colors.border });
    expect(missed.backgroundColor).toBeUndefined();
    expect(upcoming).toMatchObject({ backgroundColor: colors.surfaceMuted });
    expect(upcoming.borderWidth).toBeUndefined();

    expect(alex.slice(2)).toEqual(Array(4).fill(upcoming));
    expect(alex).not.toContainEqual(missed);
  });

  it('renders a newly accepted challenge as mostly upcoming on both rows, not mostly missed', () => {
    const fresh = challenge({
      you: track([week(0, 'in_progress')], 6),
      them: { username: 'sam', track: track([week(0, 'in_progress')], 6) },
    });
    for (const row of rowsOf(render(fresh))) {
      expect(circlesOf(row)).toEqual(['in_progress', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    }
  });

  it('shows both rows, stacked, on a collapsed challenge card too', () => {
    expect(rowsOf(render(asCreator, 'active', false))).toHaveLength(2);
  });
});

describe('GoalCard ended_early challenge', () => {
  const endedBySam = challenge({
    status: 'ended_early',
    ended_on: '2026-09-10',
    ended_by: 'them',
    you: track([week(0, 'met')], 1),
    them: { username: 'sam', track: track([week(0, 'missed')], 1) },
  });

  it('says who ended it and when, in place of the full-term header', () => {
    const text = allText(render(endedBySam, 'finished'));
    expect(text).toContain('Ended early');
    expect(text).toContain('sam ended this on Sep 10');
    expect(text).not.toContain('Week 6 of 6');
  });

  it('says you ended it when the viewer did', () => {
    const text = allText(render({ ...endedBySam, ended_by: 'you' }, 'finished'));
    expect(text).toContain('You ended this on Sep 10');
  });

  it('keeps both rows', () => {
    expect(rowsOf(render(endedBySam, 'finished'))).toHaveLength(2);
  });

  it('leaves a plain finished challenge with its full-term header and no ended line', () => {
    const text = allText(render(challenge({ status: 'finished' }), 'finished'));
    expect(text).toContain('Week 6 of 6');
    expect(text.some((t) => t.includes('ended this'))).toBe(false);
  });
});

describe('GoalCard ended_early goal', () => {
  const endedGoal = goal({
    status: 'ended_early',
    ended_on: '2026-09-10',
    ended_by: 'you',
    you: track([week(0, 'met')], 1),
  });

  it('says you ended it, in place of the full-term header, on its single row', () => {
    const root = render(endedGoal, 'finished');
    const text = allText(root);
    expect(text).toContain('Ended early');
    expect(text).toContain('You ended this on Sep 10');
    expect(text).not.toContain('Week 6 of 6');
    expect(rowsOf(root)).toHaveLength(0);
  });

  it('leaves a goal that ran its full term with "Week 6 of 6" and no ended line', () => {
    const text = allText(render(goal({ status: 'finished' }), 'finished'));
    expect(text).toContain('Week 6 of 6');
    expect(text.some((t) => t.includes('ended this'))).toBe(false);
  });
});
