import { Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import type { DaySchedule, EntryRef, ResolvedEntry } from './api';
import { DaySection } from './DaySection';

function render(element: React.ReactElement): ReactTestInstance {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree!.root;
}

function renderJSON(element: React.ReactElement): unknown {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
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

const planStartsOn = new Date(2026, 0, 1);
const planEndsOn = new Date(2026, 11, 31);
const date = new Date(2026, 7, 12);

const scheduledEntry: ResolvedEntry = {
  entry_id: 'entry-1',
  workout_id: 'workout-1',
  name: 'Tempo Run',
  notes: 'Negative split the back half',
  status: 'scheduled',
  replaced: null,
};

const cancelledTarget: EntryRef = { entry_id: 'entry-2', name: 'Leg Day' };

function baseProps(overrides: Partial<Parameters<typeof DaySection>[0]> = {}): Parameters<typeof DaySection>[0] {
  return {
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
    const day: DaySchedule = { status: 'scheduled', entries: [scheduledEntry], cancelled: [] };
    const root = render(<DaySection {...baseProps({ day })} />);
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Tempo Run');
    expect(root.findAllByType(TouchableOpacity).some((n) => n.props.accessibilityLabel === 'Add workout')).toBe(true);
  });

  it('renders the empty state with a hint, and a working add button, when there are no entries', () => {
    const day: DaySchedule = { status: 'empty', entries: [], cancelled: [] };
    const onRequestAdd = jest.fn();
    const root = render(<DaySection {...baseProps({ day, onRequestAdd })} />);
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
    const root = render(<DaySection {...baseProps({ date: new Date(2020, 0, 1) })} />);
    const texts = root.findAllByType(Text).map((t) => t.props.children);
    expect(texts).toContain('Before this plan starts');
    expect(root.findAllByType(TouchableOpacity).some((n) => n.props.accessibilityLabel === 'Add workout')).toBe(false);
  });

  it('renders identically for the same date and day data, however the host wires its own callbacks', () => {
    // Mixed day (a scheduled entry + a cancelled one) so the comparison
    // exercises more than the trivial empty case.
    const day: DaySchedule = { status: 'substituted', entries: [scheduledEntry], cancelled: [cancelledTarget] };

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
});
