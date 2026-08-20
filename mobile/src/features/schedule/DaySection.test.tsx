import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { api } from '@/api/client';

import type { DaySchedule, EntryRef, ResolvedEntry } from './api';
import { DaySection } from './DaySection';

// DaySection pulls in @/features/logs/completions, which pulls in
// @/api/client -> @/lib/supabase's AsyncStorage-backed client, unavailable
// outside a native runtime. Every test here either never fires a mutation or
// stubs the specific call it needs, so the real client is never invoked.
// GET defaults to an empty day (DaySection's own completions-by-date query,
// which feeds the amount affordance -- see dayCompletions.test.ts and
// DayItem.test.tsx for that behaviour in isolation) so tests that don't care
// about it aren't left waiting on an unmocked call.
jest.mock('@/api/client', () => ({
  api: {
    GET: jest.fn().mockResolvedValue({ data: [], response: { ok: true, status: 200 } }),
    POST: jest.fn(),
    PATCH: jest.fn(),
    DELETE: jest.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okResponse(status: number) {
  return { ok: status < 300, status } as Response;
}

/**
 * Polls `check` under real timers until it passes, rather than guessing a
 * fixed number of ticks -- TanStack Query's notifyManager batches state
 * notifications via a real setTimeout, and a hardcoded tick count is
 * inherently racy against that. Deliberately does NOT open its own act()
 * scope -- callers await this from inside one continuous `act(async () =>
 * ...)` spanning the whole interaction (tap, settle, assert), since hopping
 * in and out of separate act() calls left a scheduled notifyManager timeout
 * able to fire after the test (and the whole Jest environment) had already
 * torn down.
 */
async function waitFor(check: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition never became true');
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

function renderWithClient(element: React.ReactElement): ReactTestInstance {
  const client = new QueryClient();
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
  return tree!.root;
}

function renderJSON(element: React.ReactElement): unknown {
  const client = new QueryClient();
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  });
  return normalize(tree!.toJSON());
}

// Strips function props (onPress, onRetry, ...) before structural
// comparison -- every host builds its own closures, so two independent
// renders never share function identity even when everything else matches.
function normalize(node: unknown): unknown {
  if (typeof node === 'function') {
    return '[Function]';
  }
  if (Array.isArray(node)) {
    return node.map(normalize);
  }
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>).map(([key, value]) => [key, normalize(value)]),
    );
  }
  return node;
}

const planId = 'plan-1';
const planStartsOn = new Date(2026, 0, 1);
const planEndsOn = new Date(2026, 11, 31);
// A fixed past date, safely behind any run of this suite -- keeps `canLog`
// true (see the dedicated future-day test for the false case) without the
// tests themselves needing to reason about "today".
const date = new Date(2026, 7, 12);

const scheduledEntry: ResolvedEntry = {
  entry_id: 'entry-1',
  workout_id: 'workout-1',
  name: 'Tempo Run',
  notes: 'Negative split the back half',
  status: 'scheduled',
  replaced: null,
  completion_id: null,
};

const cancelledTarget: EntryRef = { entry_id: 'entry-2', name: 'Leg Day' };

function baseProps(overrides: Partial<Parameters<typeof DaySection>[0]> = {}): Parameters<typeof DaySection>[0] {
  return {
    planId,
    date,
    day: undefined as DaySchedule | undefined,
    isLoading: false,
    error: null,
    onRetry: jest.fn(),
    planStartsOn,
    planEndsOn,
    onRequestAdd: jest.fn(),
    onRequestEntryAction: jest.fn(),
    ...overrides,
  };
}

describe('DaySection', () => {
  it('renders entry rows for a day with entries, and the add button', () => {
    const day: DaySchedule = { status: 'scheduled', entries: [scheduledEntry], cancelled: [], completed: false };
    const root = renderWithClient(<DaySection {...baseProps({ day })} />);
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Tempo Run');
    expect(root.findAllByType(TouchableOpacity).some((n) => n.props.accessibilityLabel === 'Add workout')).toBe(true);
  });

  it('renders the empty state with a hint, and a working add button, when there are no entries', () => {
    const day: DaySchedule = { status: 'empty', entries: [], cancelled: [], completed: false };
    const onRequestAdd = jest.fn();
    const root = renderWithClient(<DaySection {...baseProps({ day, onRequestAdd })} />);
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Nothing scheduled');
    expect(texts).toContain('Tap ⊕ to add a workout');

    const addButton = root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === 'Add workout');
    expect(addButton).toBeDefined();
    act(() => {
      addButton!.props.onPress();
    });
    expect(onRequestAdd).toHaveBeenCalledWith(date);
  });

  it('shows the out-of-window message and hides the add button before the plan starts', () => {
    const root = renderWithClient(<DaySection {...baseProps({ date: new Date(2020, 0, 1) })} />);
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Before this plan starts');
    expect(root.findAllByType(TouchableOpacity).some((n) => n.props.accessibilityLabel === 'Add workout')).toBe(false);
  });

  it('renders identically for the same date and day data, however the host wires its own callbacks', () => {
    // Mixed day (a scheduled entry + a cancelled one) so the comparison
    // exercises more than the trivial empty case.
    const day: DaySchedule = {
      status: 'substituted',
      entries: [scheduledEntry],
      cancelled: [cancelledTarget],
      completed: false,
    };

    // Two independent sets of closures, standing in for "Day mode built its
    // own" vs "Week mode built its own" -- Stage 0's whole point is that
    // DaySection doesn't know or care which host it's in.
    const dayHostTree = renderJSON(
      <DaySection {...baseProps({ day, onRetry: jest.fn(), onRequestAdd: jest.fn(), onRequestEntryAction: jest.fn() })} />,
    );
    const weekHostTree = renderJSON(
      <DaySection {...baseProps({ day, onRetry: jest.fn(), onRequestAdd: jest.fn(), onRequestEntryAction: jest.fn() })} />,
    );

    expect(dayHostTree).toEqual(weekHostTree);
  });

  it('shows a filled circle for a logged entry and a hollow one for an unlogged sibling, on the same day', () => {
    const logged: ResolvedEntry = { ...scheduledEntry, entry_id: 'entry-1', name: 'Push', completion_id: 'c1' };
    const unlogged: ResolvedEntry = { ...scheduledEntry, entry_id: 'entry-3', name: 'Pull', completion_id: null };
    const day: DaySchedule = { status: 'scheduled', entries: [logged, unlogged], cancelled: [], completed: false };
    const root = renderWithClient(<DaySection {...baseProps({ day })} />);

    const doneCircle = root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === 'Mark Push not done');
    const notDoneCircle = root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === 'Mark Pull done');
    expect(doneCircle).toBeDefined();
    expect(notDoneCircle).toBeDefined();
  });

  it('renders no leading circle for any entry on a future day', () => {
    const entry: ResolvedEntry = { ...scheduledEntry, completion_id: null };
    const day: DaySchedule = { status: 'scheduled', entries: [entry], cancelled: [], completed: false };
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const root = renderWithClient(
      <DaySection {...baseProps({ day, date: future, planEndsOn: null })} />,
    );

    const circle = root
      .findAllByType(TouchableOpacity)
      .find((n) => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Mark '));
    expect(circle).toBeUndefined();
  });

  it('renders no leading circle for a cancelled entry', () => {
    const day: DaySchedule = {
      status: 'scheduled',
      entries: [{ ...scheduledEntry, completion_id: 'c1' }],
      cancelled: [cancelledTarget],
      completed: false,
    };
    const root = renderWithClient(<DaySection {...baseProps({ day })} />);

    const cancelledLabel = `Manage ${cancelledTarget.name}, cancelled`;
    const cancelledRow = root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === cancelledLabel);
    expect(cancelledRow).toBeDefined();
    const markLabels = root
      .findAllByType(TouchableOpacity)
      .map((n) => n.props.accessibilityLabel)
      .filter((label): label is string => typeof label === 'string' && label.startsWith('Mark '));
    // Only the one live entry gets a circle -- the cancelled row never does.
    expect(markLabels).toEqual(['Mark Tempo Run not done']);
  });
});

describe('DaySection tap to log/unlog', () => {
  function renderWithOwnClient(element: React.ReactElement): { root: ReactTestInstance; client: QueryClient } {
    const client = new QueryClient();
    let tree: ReactTestRenderer;
    act(() => {
      tree = renderer.create(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
    });
    return { root: tree!.root, client };
  }

  function findCircle(root: ReactTestInstance, label: string): ReactTestInstance | undefined {
    return root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);
  }

  function requireCircle(root: ReactTestInstance, label: string): ReactTestInstance {
    const circle = findCircle(root, label);
    expect(circle).toBeDefined();
    return circle!;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('fills the circle optimistically and disables it while the request is in flight', async () => {
    const { promise, resolve } = deferred<{ data: unknown; response: Response }>();
    (api.POST as jest.Mock).mockReturnValue(promise);

    const day: DaySchedule = {
      status: 'scheduled',
      entries: [{ ...scheduledEntry, completion_id: null }],
      cancelled: [],
      completed: false,
    };
    const { root } = renderWithOwnClient(<DaySection {...baseProps({ day })} />);

    await act(async () => {
      requireCircle(root, 'Mark Tempo Run done').props.onPress();
      await waitFor(() => findCircle(root, 'Mark Tempo Run not done') !== undefined);
    });

    const circle = requireCircle(root, 'Mark Tempo Run not done');
    expect(circle.props.accessibilityState.checked).toBe(true);
    expect(circle.props.disabled).toBe(true);

    // Settle the request so no dangling promise survives past the test.
    await act(async () => {
      resolve({ data: { id: 'c1' }, response: okResponse(201) });
      await promise;
    });
  });

  it('rolls back to hollow and alerts on a network/server failure', async () => {
    const { promise, reject } = deferred<{ data: unknown; response: Response }>();
    (api.POST as jest.Mock).mockReturnValue(promise);

    const day: DaySchedule = {
      status: 'scheduled',
      entries: [{ ...scheduledEntry, completion_id: null }],
      cancelled: [],
      completed: false,
    };
    const { root } = renderWithOwnClient(<DaySection {...baseProps({ day })} />);

    await act(async () => {
      requireCircle(root, 'Mark Tempo Run done').props.onPress();
      await waitFor(() => findCircle(root, 'Mark Tempo Run not done')?.props.disabled === true);
      reject(new Error('network down'));
      await promise.catch(() => undefined);
      await waitFor(() => (Alert.alert as jest.Mock).mock.calls.length > 0);
    });

    const circle = requireCircle(root, 'Mark Tempo Run done');
    expect(circle.props.accessibilityState.checked).toBe(false);
    expect(circle.props.disabled).toBe(false);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });

  it('on a 409, refetches instead of showing an error', async () => {
    const { promise, resolve } = deferred<{ data: unknown; error: unknown; response: Response }>();
    (api.POST as jest.Mock).mockReturnValue(promise);

    const day: DaySchedule = {
      status: 'scheduled',
      entries: [{ ...scheduledEntry, completion_id: null }],
      cancelled: [],
      completed: false,
    };
    const { root, client } = renderWithOwnClient(<DaySection {...baseProps({ day })} />);
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    await act(async () => {
      requireCircle(root, 'Mark Tempo Run done').props.onPress();
      await waitFor(() => findCircle(root, 'Mark Tempo Run not done')?.props.disabled === true);
      // A conflict is a normal (ok: false) HTTP response, not a thrown/rejected
      // fetch -- openapi-fetch resolves either way; only network-level
      // failures (no response at all) reject the promise.
      resolve({ data: undefined, error: { detail: 'conflict' }, response: okResponse(409) });
      await promise;
      await waitFor(() => invalidateSpy.mock.calls.length > 0);
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plans', planId, 'schedule'] });
  });

  it('unlogs: tapping a filled circle calls DELETE and reverts it to hollow', async () => {
    (api.DELETE as jest.Mock).mockResolvedValue({ data: undefined, response: okResponse(204) });

    const day: DaySchedule = {
      status: 'scheduled',
      entries: [{ ...scheduledEntry, completion_id: 'c1' }],
      cancelled: [],
      completed: true,
    };
    const { root } = renderWithOwnClient(<DaySection {...baseProps({ day })} />);

    await act(async () => {
      requireCircle(root, 'Mark Tempo Run not done').props.onPress();
      await waitFor(() => findCircle(root, 'Mark Tempo Run done') !== undefined);
    });

    expect(api.DELETE).toHaveBeenCalledWith(
      '/completions/{completion_id}',
      expect.objectContaining({ params: { path: { completion_id: 'c1' } } }),
    );
    const circle = requireCircle(root, 'Mark Tempo Run done');
    expect(circle.props.accessibilityState.checked).toBe(false);
  });

  it('invalidates the Log tab queries after a successful log', async () => {
    (api.POST as jest.Mock).mockResolvedValue({
      data: { id: 'new-completion' },
      response: okResponse(201),
    });

    const day: DaySchedule = {
      status: 'scheduled',
      entries: [{ ...scheduledEntry, completion_id: null }],
      cancelled: [],
      completed: false,
    };
    const { root, client } = renderWithOwnClient(<DaySection {...baseProps({ day })} />);
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    await act(async () => {
      requireCircle(root, 'Mark Tempo Run done').props.onPress();
      await waitFor(() => invalidateSpy.mock.calls.some((call) => call[0]?.queryKey?.[0] === 'completions'));
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['completions'] });
  });
});
