import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { FlatList, Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { api } from '@/api/client';

import type { DaySchedule, ResolvedEntry } from './api';
import { MonthView } from './MonthView';

// Only the network layer is faked: the schedule query, its cache, and DaySection are all real,
// so the fetch count below is the one the app would actually make.
jest.mock('@/api/client', () => ({ api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() } }));

// FlatList and TanStack Query both schedule work on timers; fake ones keep it inside act().
jest.useFakeTimers();

const WIDTH = 390;
const planStartsOn = new Date(2026, 7, 5); // Aug 5 2026 -- Aug 1-4 are before the plan
const key = (date: Date) => format(date, 'yyyy-MM-dd');
const header = (date: Date) => format(date, 'EEEE, MMMM d');

function entry(id: string, name: string): ResolvedEntry {
  return { entry_id: id, workout_id: `w-${id}`, name, notes: null, status: 'scheduled', replaced: null, completion_id: null };
}

function scheduled(...entries: ResolvedEntry[]): DaySchedule {
  return { status: 'scheduled', completed: false, entries, cancelled: [] };
}

const AUG_12 = new Date(2026, 7, 12);
const AUG_14 = new Date(2026, 7, 14);
const AUG_3 = new Date(2026, 7, 3);

const days: Record<string, DaySchedule> = {
  [key(AUG_12)]: scheduled(entry('a', 'Tempo Run')),
  [key(AUG_14)]: scheduled(entry('b', 'Leg press')),
};

const ok = (data: unknown) => Promise.resolve({ data, response: { ok: true, status: 200 } as Response });

beforeEach(() => {
  jest.mocked(api.GET).mockReset();
  jest.mocked(api.GET).mockImplementation(((path: string) =>
    // Every schedule range gets the same days (only August's matter); anything else -- DaySection's
    // completions-by-date query -- gets an empty list.
    path === '/plans/{plan_id}/schedule' ? ok({ days }) : ok([])) as unknown as typeof api.GET);
});

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((tree) => tree.unmount());
    jest.runOnlyPendingTimers();
  });
});

/** Mirrors CalendarArea's ownership of focusedDate, so a tap's write flows back into MonthView. */
function Harness({ initial, onSet }: { initial: Date; onSet: (date: Date) => void }) {
  const [focusedDate, setFocusedDate] = useState(initial);
  return (
    <MonthView
      planId="plan"
      focusedDate={focusedDate}
      onFocusedDateChange={(date) => {
        onSet(date);
        setFocusedDate(date);
      }}
      planStartsOn={planStartsOn}
      planEndsOn={null}
      onRequestAdd={jest.fn()}
      onRequestEntryAction={jest.fn()}
      width={WIDTH}
    />
  );
}

/**
 * Lets resolved fetches land: promises settle, then TanStack's batched notify timer fires.
 * Timers run in their own sync act() -- inside an async one they'd also fire React's
 * "act() was not awaited" check early.
 */
async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      jest.runOnlyPendingTimers();
    });
  }
}

async function mount(initial: Date) {
  const onSet = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <Harness initial={initial} onSet={onSet} />
      </QueryClientProvider>,
    );
  });
  mounted.push(tree);
  await flush();
  const root = tree.root;
  return {
    root,
    onSet,
    /** Taps the August page's cell for `date` (picked from dates no neighbouring page also draws). */
    tap: async (date: Date) => {
      const [cell] = root
        .findAllByType(TouchableOpacity)
        .filter((node) => node.props.accessibilityLabel === header(date) && node.props.onPress);
      act(() => cell.props.onPress());
      await flush();
    },
  };
}

const texts = (root: ReactTestInstance) =>
  root.findAllByType(Text).map((node) => [node.props.children].flat().join(''));

/** Requests for exactly August 2026's grid range: Sun Jul 26 through Sat Sep 5. */
function augustFetches() {
  // api.GET's overloaded typing collapses mock.calls to never; read them as plain tuples.
  const calls = jest.mocked(api.GET).mock.calls as unknown as [string, unknown][];
  return calls.filter(([path, init]) => {
      const query = (init as { params?: { query?: { from?: string; to?: string } } } | undefined)?.params?.query;
      return path === '/plans/{plan_id}/schedule' && query?.from === '2026-07-26' && query?.to === '2026-09-05';
    });
}

describe('MonthView day section', () => {
  it('selects a tapped day in place: focusedDate updates and the card follows, still in Month', async () => {
    const view = await mount(AUG_12);

    await view.tap(AUG_14);

    expect(view.onSet).toHaveBeenCalledWith(AUG_14);
    expect(texts(view.root)).toContain(header(AUG_14));
    // Still the month pager, not another view.
    expect(view.root.findAllByType(FlatList)).toHaveLength(1);
  });

  it("renders focusedDate's entries in the card", async () => {
    const view = await mount(AUG_12);

    expect(texts(view.root)).toContain(header(AUG_12));
    expect(texts(view.root)).toContain('Tempo Run');
    expect(texts(view.root)).not.toContain('Leg press');
  });

  it('shows the out-of-plan state, without the add button, for a selected day before the plan starts', async () => {
    const view = await mount(AUG_12);

    await view.tap(AUG_3);

    expect(texts(view.root)).toContain('Before this plan starts');
    expect(
      view.root.findAllByType(TouchableOpacity).filter((node) => node.props.accessibilityLabel === 'Add workout'),
    ).toHaveLength(0);
  });

  it("shares the visible month's schedule fetch instead of making its own", async () => {
    const view = await mount(AUG_12);
    expect(augustFetches()).toHaveLength(1);

    await view.tap(AUG_14);
    expect(augustFetches()).toHaveLength(1);
  });
});
