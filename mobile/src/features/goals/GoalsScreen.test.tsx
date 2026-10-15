import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { api } from '@/api/client';

// The screen lives under app/, where expo-router would treat a test file as a route.
import GoalsScreen from '../../../app/(app)/(tabs)/goals';

import { CHALLENGE_CAP_LINE } from './challengeCopy';
import type { CommitmentRead, CommitmentsListResponse, TrackRead } from './commitments';

jest.mock('@/api/client', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
}));

const started: TrackRead = {
  weeks: [{ index: 0, sessions_done: 1, met: false, in_progress: true }],
  weeks_total: 6,
  weeks_passed: 0,
  current_streak: 0,
  longest_streak: 0,
};

function base(id: string, status: CommitmentRead['status']): CommitmentRead {
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
const goal = (id: string): CommitmentRead => ({ ...base(id, 'active'), starts_on: '2026-09-01', you: started });
const runningChallenge = (id: string): CommitmentRead => ({
  ...base(id, 'active'),
  starts_on: '2026-09-01',
  you: started,
  them: { username: 'sam', track: started },
});
const invite = (id: string): CommitmentRead => ({ ...base(id, 'invite'), them: { username: 'sam' } });

/** Serves the list the way the server would, and an empty activities vocabulary (cards fall back to the raw name). */
function serve(list: CommitmentsListResponse) {
  (api.GET as jest.Mock).mockImplementation((path: string) =>
    Promise.resolve({
      data: path === '/commitments' ? list : { activities: [], units: [] },
      error: undefined,
      response: { ok: true, status: 200 },
    }),
  );
}

async function renderScreen(list: CommitmentsListResponse) {
  serve(list);
  render(
    // gcTime Infinity: unmounting would otherwise start a 5-minute cache timer that keeps jest from exiting.
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}>
      <GoalsScreen />
    </QueryClientProvider>,
  );
  // Every row here is "running"; at least one card means the list has landed.
  await screen.findAllByText('running');
}

/** The Accept/Decline buttons, read through the same accessibilityState the user's screen reader gets. */
function isDisabled(label: string): boolean {
  return Boolean(screen.getAllByRole('button', { name: label })[0].props.accessibilityState?.disabled);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Goals tab sections', () => {
  it('has no Invites section -- not even a header -- when there are no invites', async () => {
    await renderScreen({ active: [goal('g1'), runningChallenge('c1')], finished: [] });
    expect(screen.queryByText(/^Invites/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
  });

  it('shows the Invites section above Active when an invite exists', async () => {
    await renderScreen({ active: [invite('i1'), goal('g1')], finished: [] });
    expect(screen.getByText('Invites · 1')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('sam challenged you')).toBeTruthy();
  });
});

describe('Goals tab chips', () => {
  it('never shows the chips to a user with only goals', async () => {
    await renderScreen({ active: [goal('g1'), goal('g2')], finished: [] });
    for (const label of ['All', 'Solo', 'Friends']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  it('shows the chips once a challenge exists', async () => {
    await renderScreen({ active: [goal('g1'), runningChallenge('c1')], finished: [] });
    for (const label of ['All', 'Solo', 'Friends']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('Solo hides the Invites section entirely', async () => {
    await renderScreen({ active: [invite('i1'), goal('g1')], finished: [] });
    expect(screen.getByText('Invites · 1')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Solo' }));

    expect(screen.queryByText(/^Invites/)).toBeNull();
    expect(screen.queryByText('sam challenged you')).toBeNull();
  });
});

describe('Goals tab challenge cap', () => {
  const fiveRunning = ['c1', 'c2', 'c3', 'c4', 'c5'].map(runningChallenge);

  it('at 5 running challenges: one cap line, every Accept disabled, every Decline enabled', async () => {
    await renderScreen({ active: [invite('i1'), invite('i2'), ...fiveRunning], finished: [] });

    expect(screen.getAllByText(CHALLENGE_CAP_LINE)).toHaveLength(1);
    const accepts = screen.getAllByRole('button', { name: 'Accept' });
    const declines = screen.getAllByRole('button', { name: 'Decline' });
    expect(accepts).toHaveLength(2);
    expect(accepts.every((b) => b.props.accessibilityState?.disabled)).toBe(true);
    expect(declines.every((b) => !b.props.accessibilityState?.disabled)).toBe(true);
  });

  it('under the cap: no cap line, Accept enabled', async () => {
    await renderScreen({ active: [invite('i1'), ...fiveRunning.slice(0, 4)], finished: [] });
    expect(screen.queryByText(CHALLENGE_CAP_LINE)).toBeNull();
    expect(isDisabled('Accept')).toBe(false);
  });

  it('Solo never hides a running challenge from the cap count', async () => {
    await renderScreen({ active: [invite('i1'), ...fiveRunning, goal('g1')], finished: [] });
    fireEvent.press(screen.getByRole('button', { name: 'Solo' }));
    fireEvent.press(screen.getByRole('button', { name: 'All' }));
    expect(isDisabled('Accept')).toBe(true);
  });
});
