import { addDays, format, startOfWeek } from 'date-fns';
import { Text, TouchableOpacity, View } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { colors, dotSize } from '@/theme';

import type { ScheduleResponse } from './api';
import { WeekStrip } from './WeekStrip';

function render(element: React.ReactElement): ReactTestInstance {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree!.root;
}

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style : [style]).filter(Boolean));
}

// A fixed Sunday-start week, well inside a wide-open plan window.
const weekStart = startOfWeek(new Date(2026, 7, 9)); // Aug 9 2026, already a Sunday
const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
const planStartsOn = new Date(2026, 0, 1);
const planEndsOn = new Date(2026, 11, 31);

function scheduleWith(
  statuses: Record<string, ScheduleResponse['days'][string]['status']>,
  completed: Record<string, boolean> = {},
): ScheduleResponse {
  const days: ScheduleResponse['days'] = {};
  for (const date of dates) {
    const key = format(date, 'yyyy-MM-dd');
    const status = statuses[key] ?? 'empty';
    days[key] = { status, entries: [], cancelled: [], completed: completed[key] ?? false };
  }
  return { days };
}

describe('WeekStrip', () => {
  it('renders seven cells with the weekday letter and date number, in Sunday-start order', () => {
    const root = render(
      <WeekStrip
        dates={dates}
        schedule={undefined}
        isLoading={false}
        selectedDate={dates[0]}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={jest.fn()}
      />,
    );
    const cells = root.findAllByType(TouchableOpacity);
    expect(cells).toHaveLength(7);
    const firstTexts = cells[0].findAllByType(Text).map((t) => t.props.children);
    expect(firstTexts[0]).toBe('S');
    expect(firstTexts[1]).toBe(String(dates[0].getDate()));
    const lastTexts = cells[6].findAllByType(Text).map((t) => t.props.children);
    expect(lastTexts[0]).toBe('S');
  });

  it('draws a hollow dot for an uncompleted scheduled day and a swap glyph for a substituted day, matching DayStatusIndicator', () => {
    const key0 = dates[0].toISOString().slice(0, 10);
    const key1 = dates[1].toISOString().slice(0, 10);
    const schedule = scheduleWith({ [key0]: 'scheduled', [key1]: 'substituted' });
    const root = render(
      <WeekStrip
        dates={dates}
        schedule={schedule}
        isLoading={false}
        selectedDate={dates[0]}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={jest.fn()}
      />,
    );
    const cells = root.findAllByType(TouchableOpacity);
    // Matched on width, not just borderRadius -- the outer cell is round too
    // (radius.md) and, being dates[0]/selected, also has backgroundColor:
    // colors.accent of its own. dotSize.md is what's actually distinguishing.
    const dotViews = cells[0]
      .findAllByType(View)
      .map((v) => flatten(v.props.style))
      .filter((s) => s.width === dotSize.md);
    expect(dotViews.some((s) => s.borderColor === colors.accent)).toBe(true);
    expect(dotViews.some((s) => s.backgroundColor === colors.accent)).toBe(false);
    const swapTexts = cells[1].findAllByType(Text).map((t) => t.props.children);
    expect(swapTexts).toContain('⇄');
  });

  it('fills the dot when a scheduled day is completed', () => {
    const key0 = dates[0].toISOString().slice(0, 10);
    const schedule = scheduleWith({ [key0]: 'scheduled' }, { [key0]: true });
    const root = render(
      <WeekStrip
        dates={dates}
        schedule={schedule}
        isLoading={false}
        selectedDate={dates[0]}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={jest.fn()}
      />,
    );
    const cells = root.findAllByType(TouchableOpacity);
    const dotViews = cells[0]
      .findAllByType(View)
      .map((v) => flatten(v.props.style))
      .filter((s) => s.width === dotSize.md);
    expect(dotViews.some((s) => s.backgroundColor === colors.accent)).toBe(true);
  });

  it('still shows the swap glyph, just filled, for a substituted-and-completed day', () => {
    const key1 = dates[1].toISOString().slice(0, 10);
    const schedule = scheduleWith({ [key1]: 'substituted' }, { [key1]: true });
    const root = render(
      <WeekStrip
        dates={dates}
        schedule={schedule}
        isLoading={false}
        selectedDate={dates[0]}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={jest.fn()}
      />,
    );
    const cells = root.findAllByType(TouchableOpacity);
    const swapTexts = cells[1].findAllByType(Text).map((t) => t.props.children);
    expect(swapTexts).toContain('⇄');
    const badgeViews = cells[1].findAllByType(View).map((v) => flatten(v.props.style));
    expect(badgeViews.some((s) => s.backgroundColor === colors.accent && s.borderRadius)).toBe(true);
  });

  it('renders nothing for an empty day', () => {
    const schedule = scheduleWith({});
    const root = render(
      <WeekStrip
        dates={dates}
        schedule={schedule}
        isLoading={false}
        selectedDate={dates[0]}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={jest.fn()}
      />,
    );
    const cell = root.findAllByType(TouchableOpacity)[2];
    // Only the weekday letter and date number texts -- no glyph.
    expect(cell.findAllByType(Text)).toHaveLength(2);
  });

  it('greys out-of-plan days but keeps them tappable', () => {
    const onSelectDate = jest.fn();
    const beforePlan = new Date(2025, 0, 1);
    const afterPlan = new Date(2027, 0, 1);
    // selectedDate deliberately not beforePlan -- otherwise selected's fill
    // would legitimately win over the greying, which is a separate case.
    const root = render(
      <WeekStrip
        dates={[beforePlan]}
        schedule={undefined}
        isLoading={false}
        selectedDate={afterPlan}
        planStartsOn={afterPlan}
        planEndsOn={null}
        onSelectDate={onSelectDate}
      />,
    );
    const cell = root.findByType(TouchableOpacity);
    expect(flatten(cell.props.style).backgroundColor).toBe(colors.surfaceMuted);
    act(() => {
      cell.props.onPress();
    });
    expect(onSelectDate).toHaveBeenCalledWith(beforePlan);
  });

  it('gives the selected day a filled treatment and fires onSelectDate on tap', () => {
    const onSelectDate = jest.fn();
    const root = render(
      <WeekStrip
        dates={dates}
        schedule={undefined}
        isLoading={false}
        selectedDate={dates[3]}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={onSelectDate}
      />,
    );
    const cells = root.findAllByType(TouchableOpacity);
    expect(flatten(cells[3].props.style).backgroundColor).toBe(colors.accent);
    expect(flatten(cells[0].props.style).backgroundColor).not.toBe(colors.accent);
    act(() => {
      cells[5].props.onPress();
    });
    expect(onSelectDate).toHaveBeenCalledWith(dates[5]);
  });

  it('renders no add button anywhere in the strip', () => {
    const root = render(
      <WeekStrip
        dates={dates}
        schedule={undefined}
        isLoading={false}
        selectedDate={dates[0]}
        planStartsOn={planStartsOn}
        planEndsOn={planEndsOn}
        onSelectDate={jest.fn()}
      />,
    );
    const allText = root.findAllByType(Text).map((t) => t.props.children);
    expect(allText).not.toContain('⊕');
  });
});
