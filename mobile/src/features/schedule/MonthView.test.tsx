import { addDays, format, startOfMonth, startOfToday, subDays } from 'date-fns';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { DayStatusIndicator } from '@/components/DayStatusIndicator';
import { colors, monthGridRow, selectionCircle } from '@/theme';

import type { DaySchedule } from './api';
import { MAX_GRID_ROWS } from './month';
import { MonthPage } from './MonthView';

jest.mock('@/api/client', () => ({ api: { GET: jest.fn(), POST: jest.fn(), PATCH: jest.fn(), DELETE: jest.fn() } }));

let mockDays: Record<string, DaySchedule> = {};
jest.mock('./api', () => ({
  useSchedule: () => ({ data: { days: mockDays }, isLoading: false, isError: false, error: null, refetch: jest.fn() }),
}));

beforeEach(() => {
  mockDays = {};
});

// Fixed months, well away from today. Feb 2026 starts on a Sunday and has 28 days.
const FEB_2026 = new Date(2026, 1, 1); // 4 rows
const SEP_2026 = new Date(2026, 8, 1); // 5 rows
const AUG_2026 = new Date(2026, 7, 1); // 6 rows

function renderMonth(
  monthStart: Date,
  planStartsOn = new Date(2020, 0, 1),
  { selectedDate = new Date(2020, 0, 1), onSelectDate = jest.fn() }: { selectedDate?: Date; onSelectDate?: jest.Mock } = {},
): ReactTestInstance {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <MonthPage
        planId="plan"
        monthStart={monthStart}
        planStartsOn={planStartsOn}
        planEndsOn={null}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />,
    );
  });
  return tree!.root;
}

const flat = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style) ?? {};

function viewsWithHeight(root: ReactTestInstance, height: number) {
  return root.findAll((node) => node.type === View && flat(node).height === height);
}

function cellFor(root: ReactTestInstance, date: Date) {
  const label = format(date, 'EEEE, MMMM d');
  const [cell] = root.findAllByType(TouchableOpacity).filter((node) => node.props.accessibilityLabel === label);
  return cell;
}

describe('MonthPage grid', () => {
  it.each([
    ['Feb 2026', 4, FEB_2026],
    ['Sep 2026', 5, SEP_2026],
    ['Aug 2026', 6, AUG_2026],
  ])('renders %s as %i rows, in a grid that always reserves six', (_label, weeks, monthStart) => {
    const root = renderMonth(monthStart);

    expect(viewsWithHeight(root, monthGridRow.height)).toHaveLength(weeks);
    expect(root.findAllByType(TouchableOpacity)).toHaveLength(weeks * 7);
    expect(viewsWithHeight(root, monthGridRow.height * MAX_GRID_ROWS)).toHaveLength(1);
  });

  it('greys out days before the plan starts and leaves in-plan days plain', () => {
    const root = renderMonth(AUG_2026, new Date(2026, 7, 25));

    expect(flat(cellFor(root, new Date(2026, 7, 24))).backgroundColor).toBe(colors.surfaceMuted);
    expect(flat(cellFor(root, new Date(2026, 7, 25))).backgroundColor).toBeUndefined();
  });

  it.each([
    ['five-row', SEP_2026, new Date(2026, 8, 15)],
    ['six-row', AUG_2026, new Date(2026, 7, 25)],
  ])('draws the status dot for a scheduled day in a %s month', (_label, monthStart, day) => {
    mockDays = {
      [format(day, 'yyyy-MM-dd')]: { status: 'scheduled', completed: false, entries: [], cancelled: [] },
    };
    const root = renderMonth(monthStart);

    const indicator = cellFor(root, day).findByType(DayStatusIndicator);
    expect(indicator.props.status).toBe('scheduled');
    expect(indicator.findAllByType(View).length).toBeGreaterThan(0);
  });
});

describe('MonthPage selection', () => {
  // The circle behind the date number, and the number itself.
  function dateParts(cell: ReactTestInstance) {
    const [circle] = cell.findAll((node) => node.type === View && flat(node).width === selectionCircle.size);
    return { circle: flat(circle), number: StyleSheet.flatten(circle.findByType(Text).props.style) };
  }

  it('selects in-month days on tap', () => {
    const onSelectDate = jest.fn();
    const root = renderMonth(AUG_2026, undefined, { onSelectDate });

    act(() => cellFor(root, new Date(2026, 7, 14)).props.onPress());

    expect(onSelectDate).toHaveBeenCalledWith(new Date(2026, 7, 14));
  });

  it('leaves spill days visible but inert', () => {
    const onSelectDate = jest.fn();
    const root = renderMonth(AUG_2026, undefined, { onSelectDate });

    // Aug 2026's grid ends on Sat Sep 5, so Sep 1 is a spill day.
    const spill = cellFor(root, new Date(2026, 8, 1));
    expect(spill).toBeDefined();
    expect(spill.props.onPress).toBeUndefined();
    expect(spill.props.disabled).toBe(true);
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  // Real "today": isToday() reads the clock, so these render whatever month that is.
  const today = startOfToday();
  const otherDay = today.getDate() === 1 ? addDays(today, 1) : subDays(today, 1);

  it('fills the selected day, and shows today as a blue number with no fill when it is not selected', () => {
    const root = renderMonth(startOfMonth(today), undefined, { selectedDate: otherDay });

    const selected = dateParts(cellFor(root, otherDay));
    expect(selected.circle.backgroundColor).toBe(colors.accent);
    expect(selected.number.color).toBe(colors.background);

    const todayCell = dateParts(cellFor(root, today));
    expect(todayCell.circle.backgroundColor).toBeUndefined();
    expect(todayCell.number.color).toBe(colors.accent);
  });

  it('gives today the selected treatment when it is also the selected day', () => {
    const root = renderMonth(startOfMonth(today), undefined, { selectedDate: today });

    const todayCell = dateParts(cellFor(root, today));
    expect(todayCell.circle.backgroundColor).toBe(colors.accent);
    expect(todayCell.number.color).toBe(colors.background);
  });
});
