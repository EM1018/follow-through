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

function render(onToggle = jest.fn()): ReactTestInstance {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <PlanHeader
        plan={plan}
        open={false}
        onToggle={onToggle}
        viewMode="month"
        onViewModeChange={jest.fn()}
        onLayoutBottom={jest.fn()}
      />,
    );
  });
  return tree!.root;
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
