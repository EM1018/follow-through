import { router } from 'expo-router';
import { Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { PlanHeader } from './PlanHeader';
import type { PlanRead } from './planStack';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const LONG_NAME = 'Upper / Lower Strength Block — Winter';

const plan: PlanRead = {
  id: 'plan-1',
  user_id: 'user',
  name: LONG_NAME,
  starts_on: '2026-08-01',
  ends_on: null,
  is_active: true,
  visible_to_friends: false,
  created_at: '2026-08-01T00:00:00Z',
};

type Props = React.ComponentProps<typeof PlanHeader>;

function renderHeader(overrides: Partial<Props> = {}) {
  const props: Props = {
    plan,
    open: false,
    onToggle: jest.fn(),
    viewMode: 'month',
    onViewModeChange: jest.fn(),
    focusedDate: new Date(2026, 8, 30),
    onLayoutBottom: jest.fn(),
    ...overrides,
  };
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<PlanHeader {...props} />);
  });
  return {
    root: tree!.root,
    update: (next: Partial<Props>) => act(() => tree.update(<PlanHeader {...props} {...next} />)),
  };
}

function render(onToggle = jest.fn()): ReactTestInstance {
  return renderHeader({ onToggle }).root;
}

// TouchableOpacity hands its props (onPress included) to the View it renders, so match on
// the component type to get exactly one node per touchable.
function byLabel(root: ReactTestInstance, label: string) {
  return root.findAllByType(TouchableOpacity).filter((node) => node.props.accessibilityLabel === label);
}

describe('PlanHeader', () => {
  beforeEach(() => {
    jest.mocked(router.push).mockClear();
  });

  it('renders the Workouts link exactly once', () => {
    const root = render();

    expect(byLabel(root, 'Manage workouts')).toHaveLength(1);
  });

  it("navigates to the plan's workouts when Workouts is tapped", () => {
    const onToggle = jest.fn();
    const root = render(onToggle);

    act(() => byLabel(root, 'Manage workouts')[0].props.onPress());

    expect(router.push).toHaveBeenCalledWith('/(app)/plans/plan-1/workouts');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('opens the plan switcher when the plan name is tapped', () => {
    const onToggle = jest.fn();
    const root = render(onToggle);

    act(() => byLabel(root, 'Open plan switcher')[0].props.onPress());

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('truncates the plan name to one line with a tail ellipsis', () => {
    const root = render();

    const name = root.findAll((node) => node.type === Text && node.props.children === LONG_NAME);
    expect(name).toHaveLength(1);
    expect(name[0].props.numberOfLines).toBe(1);
    expect(name[0].props.ellipsizeMode).toBe('tail');
  });
});

describe('PlanHeader month title row', () => {
  function monthTitles(root: ReactTestInstance) {
    return root.findAll((node) => node.type === Text && node.props.accessibilityRole === 'header');
  }

  // Same matcher as ViewModeControl.test: role + onPress picks out each Pressable exactly once.
  function viewTabs(root: ReactTestInstance) {
    return root.findAll((node) => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function');
  }

  it('shows the month title in Month view only', () => {
    expect(monthTitles(renderHeader({ viewMode: 'month' }).root)).toHaveLength(1);
    expect(monthTitles(renderHeader({ viewMode: 'week' }).root)).toHaveLength(0);
    expect(monthTitles(renderHeader({ viewMode: 'day' }).root)).toHaveLength(0);
  });

  it("titles focusedDate's month, not today's, and follows it when paging", () => {
    const { root, update } = renderHeader({ focusedDate: new Date(2031, 2, 14) });
    expect(monthTitles(root)[0].props.children).toBe('March 2031');

    update({ focusedDate: new Date(2031, 5, 14) });
    expect(monthTitles(root)[0].props.children).toBe('June 2031');
  });

  it.each(['month', 'week', 'day'] as const)('renders the view control in %s view with it selected', (viewMode) => {
    const tabs = viewTabs(renderHeader({ viewMode }).root);

    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.props.accessibilityState.selected)).toEqual(
      ['month', 'week', 'day'].map((mode) => mode === viewMode),
    );
  });

  it('truncates the month title to one line with a tail ellipsis', () => {
    const [title] = monthTitles(renderHeader().root);

    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.ellipsizeMode).toBe('tail');
  });
});
