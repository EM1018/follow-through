import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { api } from '@/api/client';

import { GoalActionsSheet } from './GoalActionsSheet';

import type { CommitmentRead } from './commitments';

jest.mock('@/api/client', () => ({
  api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() },
}));

function commitment(overrides: Partial<CommitmentRead> = {}): CommitmentRead {
  return {
    activity: 'running',
    created_at: '2026-08-10T12:00:00Z',
    creator_id: 'u1',
    duration_weeks: null,
    ended_on: null,
    id: 'c1',
    invite_status: null,
    progress: { blocks: [], current_streak: 0, longest_streak: 0, weeks_passed: 0, weeks_total: 1 },
    recipient_id: null,
    rematch_of_id: null,
    sessions_per_week: 3,
    starts_on: '2026-08-01',
    target_unit: null,
    target_value: null,
    ...overrides,
  };
}

function renderWithClient(element: React.ReactElement): { root: ReactTestInstance; client: QueryClient } {
  const client = new QueryClient();
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
  return { root: tree!.root, client };
}

async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition never became true');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

function findByLabel(root: ReactTestInstance, label: string): ReactTestInstance | undefined {
  return root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('GoalActionsSheet', () => {
  it('shows both End goal and Delete goal for an active goal', () => {
    const { root } = renderWithClient(
      <GoalActionsSheet commitment={commitment()} activityDisplayName="Running" variant="active" onClose={jest.fn()} />,
    );
    expect(findByLabel(root, 'End goal')).toBeDefined();
    expect(findByLabel(root, 'Delete goal')).toBeDefined();
  });

  it('shows only Delete goal for a finished goal -- there is nothing left to end', () => {
    const { root } = renderWithClient(
      <GoalActionsSheet commitment={commitment()} activityDisplayName="Running" variant="finished" onClose={jest.fn()} />,
    );
    expect(findByLabel(root, 'End goal')).toBeUndefined();
    expect(findByLabel(root, 'Delete goal')).toBeDefined();
  });

  it('does not call the end endpoint until the confirmation is accepted', async () => {
    const { root } = renderWithClient(
      <GoalActionsSheet commitment={commitment()} activityDisplayName="Running" variant="active" onClose={jest.fn()} />,
    );

    act(() => {
      findByLabel(root, 'End goal')!.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(api.POST).not.toHaveBeenCalled();

    const confirmButton = (Alert.alert as jest.Mock).mock.calls[0][2].find(
      (button: { text: string }) => button.text === 'End goal',
    );
    (api.POST as jest.Mock).mockResolvedValue({
      data: commitment({ ended_on: '2026-08-20' }),
      error: undefined,
      response: { ok: true, status: 200 },
    });

    await act(async () => {
      confirmButton.onPress();
      await waitFor(() => (api.POST as jest.Mock).mock.calls.length > 0);
    });

    expect(api.POST).toHaveBeenCalledWith(
      '/commitments/{commitment_id}/end',
      expect.objectContaining({ params: { path: { commitment_id: 'c1' } } }),
    );
  });

  it('does not call the delete endpoint until the confirmation is accepted', async () => {
    const { root } = renderWithClient(
      <GoalActionsSheet commitment={commitment()} activityDisplayName="Running" variant="active" onClose={jest.fn()} />,
    );

    act(() => {
      findByLabel(root, 'Delete goal')!.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(api.DELETE).not.toHaveBeenCalled();

    const confirmButton = (Alert.alert as jest.Mock).mock.calls[0][2].find(
      (button: { text: string }) => button.text === 'Delete',
    );
    (api.DELETE as jest.Mock).mockResolvedValue({ data: undefined, error: undefined, response: { ok: true, status: 204 } });

    await act(async () => {
      confirmButton.onPress();
      await waitFor(() => (api.DELETE as jest.Mock).mock.calls.length > 0);
    });

    expect(api.DELETE).toHaveBeenCalledWith(
      '/commitments/{commitment_id}',
      expect.objectContaining({ params: { path: { commitment_id: 'c1' } } }),
    );
  });

  it('tapping Cancel closes without calling either endpoint', () => {
    const onClose = jest.fn();
    const { root } = renderWithClient(
      <GoalActionsSheet commitment={commitment()} activityDisplayName="Running" variant="active" onClose={onClose} />,
    );

    act(() => {
      findByLabel(root, 'Cancel')!.props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.POST).not.toHaveBeenCalled();
    expect(api.DELETE).not.toHaveBeenCalled();
  });

  it('renders the goal activity and terms in the header', () => {
    const { root } = renderWithClient(
      <GoalActionsSheet
        commitment={commitment({ activity: 'running', sessions_per_week: 2, target_value: 2, target_unit: 'miles' })}
        activityDisplayName="Running"
        variant="active"
        onClose={jest.fn()}
      />,
    );
    expect(root.findAllByType(Text).some((n) => n.props.children === 'Running')).toBe(true);
    expect(root.findAllByType(Text).some((n) => n.props.children === '2 mi · 2×/wk')).toBe(true);
  });
});
