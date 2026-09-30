import { addDays, addWeeks, format, getISODay, startOfToday } from 'date-fns';
import { useCallback, useState } from 'react';
import { FlatList, Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { colors } from '@/theme';

import { DayView } from './DayView';
import { MONTH_WINDOW } from './month';
import { MonthView } from './MonthView';
import type { ViewMode } from './viewMode';
import { WEEK_WINDOW } from './week';
import { WeekView } from './WeekView';

// The views' data layer is irrelevant here -- these tests are about which date
// each view derives and writes, not what's scheduled on it.
jest.mock('@/api/client', () => ({ api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() } }));
jest.mock('./api', () => ({
  useSchedule: () => ({ data: undefined, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
  scheduleQueryOptions: jest.fn(() => ({})),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ prefetchQuery: jest.fn() }),
}));
// Stub DaySection down to the one thing under test: the date it was handed.
jest.mock('./DaySection', () => {
  const { createElement } = require('react');
  const { Text: RNText } = require('react-native');
  const { format: formatDate } = require('date-fns');
  return {
    DaySection: ({ date }: { date: Date }) =>
      createElement(RNText, { testID: 'day-section' }, formatDate(date, 'yyyy-MM-dd')),
  };
});

// VirtualizedList batches its render-window updates on a timer; fake timers keep
// those from landing outside act() once a test has finished.
jest.useFakeTimers();

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((tree) => tree.unmount());
    jest.runOnlyPendingTimers();
  });
});

const WIDTH = 390;
const DAY_WINDOW = 180;
const planStartsOn = new Date(2020, 0, 1);
const planEndsOn = null;

const key = (date: Date) => format(date, 'yyyy-MM-dd');

/** Mirrors CalendarArea: one shared focusedDate, exactly one view mounted per mode. */
function Harness({ mode, initial, onSet }: { mode: ViewMode; initial: Date; onSet: (date: Date) => void }) {
  const [focusedDate, setFocusedDate] = useState(initial);
  const set = useCallback(
    (date: Date) => {
      onSet(date);
      setFocusedDate(date);
    },
    [onSet],
  );
  const common = { planId: 'plan', focusedDate, onFocusedDateChange: set, planStartsOn, planEndsOn, width: WIDTH };
  if (mode === 'day') {
    return <DayView {...common} onRequestAdd={jest.fn()} onRequestEntryAction={jest.fn()} />;
  }
  if (mode === 'week') {
    return <WeekView {...common} onRequestAdd={jest.fn()} onRequestEntryAction={jest.fn()} />;
  }
  return <MonthView {...common} onSelectDate={jest.fn()} />;
}

function mount(mode: ViewMode, initial: Date) {
  const onSet = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Harness mode={mode} initial={initial} onSet={onSet} />);
  });
  mounted.push(tree);
  return {
    onSet,
    root: () => tree.root,
    switchTo: (next: ViewMode) => act(() => tree.update(<Harness mode={next} initial={initial} onSet={onSet} />)),
    /** A settled swipe onto page `index` -- what onMomentumScrollEnd reports after a real drag. */
    swipeTo: (index: number) =>
      act(() => {
        tree.root.findByType(FlatList).props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: index * WIDTH } } });
      }),
    /** The latest date written, or the starting one if nothing was written. */
    current: () => (onSet.mock.calls.length ? onSet.mock.calls[onSet.mock.calls.length - 1][0] : initial) as Date,
  };
}

/** The DaySection on the pager's initial page -- the first one FlatList renders from initialScrollIndex. */
function visibleDaySection(root: ReactTestInstance): string {
  return root.findAllByProps({ testID: 'day-section' }).filter((n) => n.type === Text)[0].props.children;
}

/** Every Week strip cell drawn with the selected fill, across all rendered pages. */
function highlightedCells(root: ReactTestInstance): string[] {
  return root
    .findAllByType(TouchableOpacity)
    .filter((cell) => {
      const style = Object.assign({}, ...[cell.props.style].flat(Infinity).filter(Boolean));
      return style.backgroundColor === colors.accent;
    })
    .map((cell) => cell.props.accessibilityLabel);
}

const cellLabel = (date: Date) => format(date, 'EEEE, MMMM d');

// Fixed dates, well away from today, so none of this depends on when it runs.
const thursday = new Date(2026, 9, 1); // Thu Oct 1 2026

describe('Week view reads and writes focusedDate', () => {
  it('a strip tap updates focusedDate, and Day view then renders that date', () => {
    const view = mount('week', thursday);
    const saturday = addDays(thursday, 2);

    const cell = view
      .root()
      .findAllByType(TouchableOpacity)
      .find((c) => c.props.accessibilityLabel === cellLabel(saturday))!;
    act(() => cell.props.onPress());

    expect(key(view.current())).toBe(key(saturday));
    view.switchTo('day');
    expect(visibleDaySection(view.root())).toBe(key(saturday));
  });

  it('highlights exactly one cell across all rendered pages -- neighbour weeks light up nothing', () => {
    const view = mount('week', thursday);
    // FlatList renders several pages from the initial index onward; only the one containing focusedDate may highlight.
    expect(view.root().findAllByProps({ testID: 'day-section' }).filter((n) => n.type === Text).length).toBeGreaterThan(1);
    expect(highlightedCells(view.root())).toEqual([cellLabel(thursday)]);
  });

  it('paging forward then back returns the identical date, starting from a non-Sunday', () => {
    const view = mount('week', thursday);
    [1, 2, 3, 2, 1, 0].forEach((step) => view.swipeTo(WEEK_WINDOW + step));
    expect(key(view.current())).toBe(key(thursday));
  });

  it.each([
    ['Sunday', new Date(2026, 8, 27)],
    ['Thursday', thursday],
    ['Saturday', new Date(2026, 9, 3)],
  ])('paging preserves the weekday across several pages in one direction (%s)', (_name, start) => {
    const view = mount('week', start);
    for (let step = 1; step <= 4; step++) {
      view.swipeTo(WEEK_WINDOW + step);
      expect(getISODay(view.current())).toBe(getISODay(start));
      expect(key(view.current())).toBe(key(addWeeks(start, step)));
    }
  });
});

describe('Month view paging writes focusedDate', () => {
  it('paging forward then back returns the identical date', () => {
    const sept29 = new Date(2026, 8, 29);
    const view = mount('month', sept29);
    view.swipeTo(MONTH_WINDOW + 3);
    expect(key(view.current())).toBe('2026-12-29');
    [2, 1, 0].forEach((step) => view.swipeTo(MONTH_WINDOW + step));
    expect(key(view.current())).toBe(key(sept29));
  });

  it.each([
    ['a non-leap year', new Date(2027, 0, 31), '2027-02-28'],
    ['a leap year', new Date(2028, 0, 31), '2028-02-29'],
  ])('clamps to the target month length in %s (Jan 31 -> end of Feb)', (_name, jan31, expected) => {
    const view = mount('month', jan31);
    view.swipeTo(MONTH_WINDOW + 1);
    expect(key(view.current())).toBe(expected);
  });
});

describe('switching views transforms nothing', () => {
  const directions: [ViewMode, ViewMode][] = [
    ['month', 'week'],
    ['month', 'day'],
    ['week', 'month'],
    ['week', 'day'],
    ['day', 'month'],
    ['day', 'week'],
  ];

  it.each(directions)('%s -> %s leaves focusedDate unchanged', (from, to) => {
    const view = mount(from, thursday);
    view.switchTo(to);
    expect(view.onSet).not.toHaveBeenCalled();
    if (to !== 'month') {
      expect(visibleDaySection(view.root())).toBe(key(thursday));
    }
  });

  it('a pager mounting at its initial index does not write, in any view, across repeated cycles', () => {
    const view = mount('month', thursday);
    for (let cycle = 0; cycle < 3; cycle++) {
      view.switchTo('week');
      view.switchTo('day');
      view.switchTo('month');
    }
    expect(view.onSet).not.toHaveBeenCalled();
  });
});

describe('pagers anchor on focusedDate at mount', () => {
  // Beyond every pager's old today-anchored window (±180 days, ±26 weeks, ±24 months).
  const farFuture = addDays(startOfToday(), 365 * 3 + 17);

  it.each([
    ['day', DAY_WINDOW],
    ['week', WEEK_WINDOW],
    ['month', MONTH_WINDOW],
  ] as const)('%s view starts on its middle page, not a clamped edge page', (mode, middle) => {
    const view = mount(mode, farFuture);
    expect(view.root().findByType(FlatList).props.initialScrollIndex).toBe(middle);
    if (mode !== 'month') {
      expect(visibleDaySection(view.root())).toBe(key(farFuture));
    }
  });

  it('switching to Week with a far-future focusedDate highlights that day', () => {
    const view = mount('month', farFuture);
    view.switchTo('week');
    expect(highlightedCells(view.root())).toEqual([cellLabel(farFuture)]);
  });

  it.each([
    ['day', DAY_WINDOW, (d: Date, n: number) => addDays(d, n)],
    ['week', WEEK_WINDOW, (d: Date, n: number) => addWeeks(d, n)],
  ] as const)(
    '%s: every swipe maps through the same frozen anchor, so a sliding anchor would show up',
    (mode, middle, step) => {
      const view = mount(mode, thursday);
      [1, 2, 3, 4].forEach((n) => {
        view.swipeTo(middle + n);
        expect(key(view.current())).toBe(key(step(thursday, n)));
      });
      [3, 2, 1, 0].forEach((n) => view.swipeTo(middle + n));
      expect(key(view.current())).toBe(key(thursday));
    },
  );

  it('a genuine swipe does write -- real navigation is not disabled', () => {
    const view = mount('day', thursday);
    view.swipeTo(DAY_WINDOW - 1);
    expect(view.onSet).toHaveBeenCalledTimes(1);
    expect(key(view.current())).toBe(key(addDays(thursday, -1)));
  });
});
