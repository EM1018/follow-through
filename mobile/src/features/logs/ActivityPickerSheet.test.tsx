import { Text, TouchableOpacity } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { ActivityPickerSheet } from './ActivityPickerSheet';

import type { ActivityInfo } from './activities';

const ACTIVITIES: ActivityInfo[] = [
  { activity: 'running', default_unit: 'miles', display_name: 'Running', units: ['minutes', 'hours', 'miles', 'kilometers'] },
  { activity: 'strength_training', default_unit: null, display_name: 'Strength training', units: ['sets', 'reps'] },
];

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

describe('ActivityPickerSheet', () => {
  it('does not render a clear row by default', () => {
    const root = render(
      <ActivityPickerSheet activities={ACTIVITIES} selected={null} onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(findText(root, 'No activity')).toBeUndefined();
  });

  it('renders a leading "No activity" row when allowClear is set, checked when nothing is selected', () => {
    const root = render(
      <ActivityPickerSheet
        activities={ACTIVITIES}
        selected={null}
        onSelect={jest.fn()}
        onClose={jest.fn()}
        allowClear
        onClear={jest.fn()}
      />,
    );
    const noActivityText = findText(root, 'No activity');
    expect(noActivityText).toBeDefined();

    // Its row is the first in the list, ahead of every real activity.
    const rowTexts = root.findAllByType(Text).map((node) => node.props.children);
    expect(rowTexts.indexOf('No activity')).toBeLessThan(rowTexts.indexOf('Running'));
  });

  it('calls onClear, not onSelect, when the "No activity" row is pressed', () => {
    const onClear = jest.fn();
    const onSelect = jest.fn();
    const root = render(
      <ActivityPickerSheet
        activities={ACTIVITIES}
        selected="running"
        onSelect={onSelect}
        onClose={jest.fn()}
        allowClear
        onClear={onClear}
      />,
    );

    const noActivityRow = root
      .findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === 'No activity')!;
    act(() => {
      noActivityRow.props.onPress();
    });

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('still selects a real activity normally', () => {
    const onSelect = jest.fn();
    const root = render(
      <ActivityPickerSheet
        activities={ACTIVITIES}
        selected={null}
        onSelect={onSelect}
        onClose={jest.fn()}
        allowClear
        onClear={jest.fn()}
      />,
    );

    const runningRow = root
      .findAllByType(TouchableOpacity)
      .find((node) => node.props.accessibilityLabel === 'Running')!;
    act(() => {
      runningRow.props.onPress();
    });

    expect(onSelect).toHaveBeenCalledWith('running');
  });
});
