import { Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { DayItem } from './DayItem';

function render(element: React.ReactElement): ReactTestInstance {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree!.root;
}

function findText(root: ReactTestInstance, text: string): ReactTestInstance | undefined {
  return root.findAllByType(Text).find((node) => node.props.children === text);
}

describe('DayItem amount affordance', () => {
  it('is absent when the row has no completion control at all (future day, cancelled row)', () => {
    const root = render(<DayItem state="scheduled" name="Leg Day" onPress={jest.fn()} />);
    expect(findText(root, 'Add amount')).toBeUndefined();
  });

  it('is absent on an unlogged row even when the circle control is present', () => {
    const root = render(
      <DayItem
        state="scheduled"
        name="Leg Day"
        onPress={jest.fn()}
        completion={{ completionId: null, onToggle: jest.fn(), pending: false }}
      />,
    );
    expect(findText(root, 'Add amount')).toBeUndefined();
  });

  it('shows "Add amount" when logged with no value yet', () => {
    const root = render(
      <DayItem
        state="scheduled"
        name="Leg Day"
        onPress={jest.fn()}
        completion={{ completionId: 'c1', onToggle: jest.fn(), pending: false }}
        amount={{ label: 'Add amount', onPress: jest.fn() }}
      />,
    );
    expect(findText(root, 'Add amount')).toBeDefined();
  });

  it('shows the formatted amount once one is logged', () => {
    const root = render(
      <DayItem
        state="scheduled"
        name="Leg Day"
        onPress={jest.fn()}
        completion={{ completionId: 'c1', onToggle: jest.fn(), pending: false }}
        amount={{ label: '45 min', onPress: jest.fn() }}
      />,
    );
    expect(findText(root, '45 min')).toBeDefined();
  });

  it('tapping the amount affordance fires its own handler, not the row press or the circle toggle', () => {
    const onRowPress = jest.fn();
    const onToggle = jest.fn();
    const onAmountPress = jest.fn();
    const root = render(
      <DayItem
        state="scheduled"
        name="Leg Day"
        onPress={onRowPress}
        completion={{ completionId: 'c1', onToggle, pending: false }}
        amount={{ label: '45 min', onPress: onAmountPress }}
      />,
    );

    const amountTouchable = root
      .findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === 'Edit amount for Leg Day')!;
    act(() => {
      amountTouchable.props.onPress();
    });

    expect(onAmountPress).toHaveBeenCalledTimes(1);
    expect(onRowPress).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
