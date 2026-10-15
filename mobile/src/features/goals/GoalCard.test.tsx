import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet, Text } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { colors } from '@/theme';

import { CHALLENGE_CAP_LINE } from './challengeCopy';
import type { WeekCircle } from './circles';
import type { CommitmentRead, TrackRead, WeekRead } from './commitments';
import { GoalCard } from './GoalCard';
import { GoalCircles } from './GoalCircles';

// The card's action buttons reach the API through react-query; mocked so the
// failure tests can answer as the server would (and so native storage never loads).
jest.mock('@/api/client', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
}));

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

function render(
  commitment: CommitmentRead,
  variant: 'active' | 'finished' = 'active',
  expanded = true,
  { client = new QueryClient(), acceptBlocked = false }: { client?: QueryClient; acceptBlocked?: boolean } = {},
) {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <GoalCard
          commitment={commitment}
          variant={variant}
          activityDisplayName="Running"
          expanded={expanded}
          onPress={jest.fn()}
          acceptBlocked={acceptBlocked}
        />
      </QueryClientProvider>,
    );
  });
  return tree!.root;
}

/** Every Button on the card, by label, with whether it's tappable. */
function buttonsOf(root: ReactTestInstance): { label: string; disabled: boolean }[] {
  return root.findAllByType(Button).map((b) => ({ label: b.props.label, disabled: Boolean(b.props.disabled) }));
}

function press(root: ReactTestInstance, label: string) {
  const button = root.findAllByType(Button).find((b) => b.props.label === label);
  if (!button) {
    throw new Error(`No "${label}" button`);
  }
  act(() => button.props.onPress());
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

describe('GoalCard unstarted challenges', () => {
  // What the server sends before the clock starts: no starts_on, no you,
  // and them with a username but no track -- absent, not empty.
  function unstarted(status: CommitmentRead['status']): CommitmentRead {
    return {
      id: 'c2',
      status,
      activity: 'running',
      target_value: 2,
      target_unit: 'miles',
      sessions_per_week: 3,
      duration_weeks: 6,
      created_at: '2026-09-01T15:00:00Z',
      them: { username: 'sam' },
    };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 5, 12));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(['sent', 'invite', 'declined', 'expired'] as const)('renders %s with no week circles at all', (status) => {
    const root = render(unstarted(status));
    expect(root.findAllByType(GoalCircles)).toHaveLength(0);
    expect(rowsOf(root)).toHaveLength(0);
    expect(allText(root)).toContain('2 mi · 3×/wk · 6 weeks');
  });

  it('renders sent as waiting on the other participant', () => {
    expect(allText(render(unstarted('sent')))).toEqual(expect.arrayContaining(['Sent', 'Waiting for sam']));
  });

  it('renders invite with who sent it and the time left to respond', () => {
    expect(allText(render(unstarted('invite')))).toEqual(
      expect.arrayContaining(['Invite', 'sam challenged you', '9 days left to respond']),
    );
  });

  it('renders declined and expired as marked', () => {
    expect(allText(render(unstarted('declined')))).toEqual(expect.arrayContaining(['Declined', 'sam declined']));
    expect(allText(render(unstarted('expired')))).toEqual(
      expect.arrayContaining(['Expired', "sam didn't respond in time"]),
    );
  });

  it('shows the countdown only on invite', () => {
    for (const status of ['sent', 'declined', 'expired'] as const) {
      expect(allText(render(unstarted(status))).some((t) => t.includes('to respond'))).toBe(false);
    }
  });

  it('renders sent and invite with identical terms -- the same row from either side', () => {
    const terms = (status: 'sent' | 'invite') => allText(render(unstarted(status))).filter((t) => t.includes('×/wk'));
    expect(terms('sent')).toEqual(terms('invite'));
  });
});

// What the server sends before the clock starts: no starts_on, no you, and
// them with a username but no track.
function unstartedRow(status: CommitmentRead['status']): CommitmentRead {
  return {
    id: 'c3',
    status,
    activity: 'running',
    target_value: null,
    target_unit: null,
    sessions_per_week: 3,
    duration_weeks: 6,
    created_at: '2026-09-01T15:00:00Z',
    them: { username: 'sam' },
  };
}

describe('GoalCard actions per state', () => {
  it('invite offers Accept and Decline', () => {
    expect(buttonsOf(render(unstartedRow('invite')))).toEqual([
      { label: 'Accept', disabled: false },
      { label: 'Decline', disabled: false },
    ]);
  });

  it('sent offers Withdraw only', () => {
    expect(buttonsOf(render(unstartedRow('sent'))).map((b) => b.label)).toEqual(['Withdraw']);
  });

  it.each(['declined', 'expired'] as const)('%s offers Dismiss only', (status) => {
    expect(buttonsOf(render(unstartedRow(status))).map((b) => b.label)).toEqual(['Dismiss']);
  });

  it('at the cap, Accept renders disabled while Decline stays enabled', () => {
    expect(buttonsOf(render(unstartedRow('invite'), 'active', false, { acceptBlocked: true }))).toEqual([
      { label: 'Accept', disabled: true },
      { label: 'Decline', disabled: false },
    ]);
  });

  it('an expanded active challenge offers Quit', () => {
    expect(buttonsOf(render(asCreator)).map((b) => b.label)).toEqual(['Quit challenge']);
  });

  it('a goal, a finished challenge, and an ended-early challenge offer no Quit', () => {
    for (const [commitment, variant] of [
      [goal(), 'active'],
      [challenge({ status: 'finished' }), 'finished'],
      [challenge({ status: 'ended_early', ended_by: 'them', ended_on: '2026-09-10' }), 'finished'],
    ] as const) {
      expect(buttonsOf(render(commitment, variant))).toEqual([]);
    }
  });
});

describe('GoalCard action failures', () => {
  // A failed response as openapi-fetch hands it to unwrap(): the parsed body
  // in `error`, the HTTP status on `response`.
  function failWith(method: 'POST' | 'DELETE', status: number, detail: unknown) {
    (api[method] as jest.Mock).mockResolvedValue({ data: undefined, error: { detail }, response: { ok: false, status } });
  }

  let client: QueryClient;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    client = new QueryClient();
    jest.spyOn(client, 'invalidateQueries');
  });

  async function expectAlertThenRefetch(title: string, message: string) {
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(title, message));
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['commitments'] });
  }

  it('Accept at the cap says so, then refetches', async () => {
    failWith('POST', 409, { code: 'challenge_cap_reached', message: 'x' });
    press(render(unstartedRow('invite'), 'active', false, { client }), 'Accept');
    await expectAlertThenRefetch('Too many challenges', CHALLENGE_CAP_LINE);
    expect(api.POST).toHaveBeenCalledWith('/commitments/{commitment_id}/accept', expect.anything());
  });

  it('Accept on a withdrawn invite says sam withdrew it', async () => {
    failWith('POST', 404, { code: 'invite_unavailable', message: 'x' });
    press(render(unstartedRow('invite'), 'active', false, { client }), 'Accept');
    await expectAlertThenRefetch('Invite no longer available', 'sam withdrew this invite.');
  });

  it('Decline on a withdrawn invite says sam withdrew it', async () => {
    failWith('POST', 404, { code: 'invite_unavailable', message: 'x' });
    press(render(unstartedRow('invite'), 'active', false, { client }), 'Decline');
    await expectAlertThenRefetch('Invite no longer available', 'sam withdrew this invite.');
    expect(api.POST).toHaveBeenCalledWith('/commitments/{commitment_id}/decline', expect.anything());
  });

  it('Withdraw after sam accepted says sam already accepted', async () => {
    failWith('DELETE', 409, { code: 'challenge_already_accepted', message: 'x' });
    press(render(unstartedRow('sent'), 'active', false, { client }), 'Withdraw');
    await expectAlertThenRefetch('Already accepted', 'sam already accepted. The challenge is running now.');
  });

  it('Dismiss of a row already gone says nothing, and just refetches', async () => {
    failWith('DELETE', 404, 'Commitment not found');
    press(render(unstartedRow('declined'), 'active', false, { client }), 'Dismiss');
    await waitFor(() => expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['commitments'] }));
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('Quit confirms first, and only then calls the endpoint', () => {
    press(render(asCreator, 'active', true, { client }), 'Quit challenge');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Quit this challenge?',
      "This ends the challenge for both you and sam. It can't be undone.",
      expect.any(Array),
    );
    expect(api.POST).not.toHaveBeenCalled();
  });

  it('Quit after sam already ended it says the challenge is over', async () => {
    failWith('POST', 409, { code: 'challenge_not_active', message: 'x' });
    press(render(asCreator, 'active', true, { client }), 'Quit challenge');
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    act(() => buttons.find((b) => b.text === 'Quit')!.onPress!());
    await expectAlertThenRefetch('Challenge already over', 'This challenge has already ended.');
    expect(api.POST).toHaveBeenCalledWith('/commitments/{commitment_id}/end', expect.anything());
  });

  it('a successful action refetches rather than patching the list', async () => {
    (api.DELETE as jest.Mock).mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 204 } });
    press(render(unstartedRow('expired'), 'active', false, { client }), 'Dismiss');
    await waitFor(() => expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['commitments'] }));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
