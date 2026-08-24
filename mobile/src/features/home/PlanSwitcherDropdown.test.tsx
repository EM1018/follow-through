import { router } from 'expo-router';
import { Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import type { PlanRead } from './planStack';
import { PlanSwitcherDropdown } from './PlanSwitcherDropdown';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

function makePlan(overrides: Partial<PlanRead> & { id: string }): PlanRead {
  return {
    user_id: 'user',
    name: 'Plan',
    starts_on: '2026-08-01',
    ends_on: null,
    is_active: false,
    visible_to_friends: false,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function renderDropdown(element: React.ReactElement): ReactTestRenderer {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree!;
}

function findByLabel(root: ReactTestInstance, label: string): ReactTestInstance | undefined {
  return root.findAllByType(TouchableOpacity).find((n) => n.props.accessibilityLabel === label);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PlanSwitcherDropdown', () => {
  it('with exactly one plan, still renders that row plus the Manage plans note', () => {
    const onlyPlan = makePlan({ id: 'solo', name: 'Solo Plan' });
    const tree = renderDropdown(
      <PlanSwitcherDropdown plans={[onlyPlan]} currentPlanId="solo" top={0} onSelect={jest.fn()} onClose={jest.fn()} />,
    );

    expect(findByLabel(tree.root, 'Solo Plan')).toBeDefined();
    expect(tree.root.findAllByType(Text).some((n) => n.props.children === 'Manage plans to add another.')).toBe(true);
  });

  it('tapping the Manage plans note closes the dropdown and navigates', () => {
    const onClose = jest.fn();
    const onlyPlan = makePlan({ id: 'solo', name: 'Solo Plan' });
    const tree = renderDropdown(
      <PlanSwitcherDropdown plans={[onlyPlan]} currentPlanId="solo" top={0} onSelect={jest.fn()} onClose={onClose} />,
    );

    act(() => {
      findByLabel(tree.root, 'Manage plans')!.props.onPress();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/(app)/plans');
  });

  it('the current plan shows a checkmark; a non-current plan does not', () => {
    const current = makePlan({ id: 'a', name: 'Plan A' });
    const other = makePlan({ id: 'b', name: 'Plan B' });
    const tree = renderDropdown(
      <PlanSwitcherDropdown plans={[current, other]} currentPlanId="a" top={0} onSelect={jest.fn()} onClose={jest.fn()} />,
    );

    const rowA = findByLabel(tree.root, 'Plan A')!;
    const rowB = findByLabel(tree.root, 'Plan B')!;
    expect(rowA.props.accessibilityState).toEqual({ selected: true });
    expect(rowB.props.accessibilityState).toEqual({ selected: false });
  });

  it('tapping a non-current row selects it; tapping the current row just closes', () => {
    const current = makePlan({ id: 'a', name: 'Plan A' });
    const other = makePlan({ id: 'b', name: 'Plan B' });
    const onSelect = jest.fn();
    const onClose = jest.fn();
    const tree = renderDropdown(
      <PlanSwitcherDropdown plans={[current, other]} currentPlanId="a" top={0} onSelect={onSelect} onClose={onClose} />,
    );

    act(() => {
      findByLabel(tree.root, 'Plan A')!.props.onPress();
    });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      findByLabel(tree.root, 'Plan B')!.props.onPress();
    });
    expect(onSelect).toHaveBeenCalledWith('b');
  });
});
