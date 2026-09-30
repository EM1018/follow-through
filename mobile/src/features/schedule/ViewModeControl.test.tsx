import { Text } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { ViewModeControl } from './ViewModeControl';

function render(element: React.ReactElement): ReactTestInstance {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree!.root;
}

// Pressable forwards accessibilityRole to the Views it renders; matching on onPress too
// picks out exactly the Pressable itself, once per segment.
function segments(root: ReactTestInstance) {
  return root.findAll((node) => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function');
}

describe('ViewModeControl', () => {
  it('renders three tab segments in Month/Week/Day order with all labels visible', () => {
    const root = render(<ViewModeControl value="day" onChange={jest.fn()} />);

    const tabs = segments(root);
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.props.accessibilityRole)).toEqual(['tab', 'tab', 'tab']);
    expect(tabs.map((tab) => tab.findByType(Text).props.children)).toEqual(['Month', 'Week', 'Day']);
  });

  it.each(['month', 'week', 'day'] as const)('marks only the current view (%s) as selected', (value) => {
    const root = render(<ViewModeControl value={value} onChange={jest.fn()} />);

    const selected = segments(root).map((tab) => tab.props.accessibilityState.selected);
    const expected = ['month', 'week', 'day'].map((mode) => mode === value);
    expect(selected).toEqual(expected);
  });

  it('calls onChange with the tapped view', () => {
    const onChange = jest.fn();
    const root = render(<ViewModeControl value="day" onChange={onChange} />);
    const [month, week] = segments(root);

    act(() => month.props.onPress());
    act(() => week.props.onPress());

    expect(onChange.mock.calls).toEqual([['month'], ['week']]);
  });

  it('does nothing when the already-selected view is tapped', () => {
    const onChange = jest.fn();
    const root = render(<ViewModeControl value="week" onChange={onChange} />);

    act(() => segments(root)[1].props.onPress());

    expect(onChange).not.toHaveBeenCalled();
  });
});
