import { Text, TouchableOpacity, View } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { colors } from '@/theme';

import { WeekItem } from './WeekItem';

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

describe('WeekItem', () => {
  it('renders the name on a single line, truncated rather than wrapped', () => {
    const root = render(<WeekItem state="scheduled" name="Shoulder press and barbell bench" onPress={jest.fn()} />);
    const name = root.findByType(Text);
    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.children).toBe('Shoulder press and barbell bench');
  });

  it('renders a scheduled chip filled, without an accent bar', () => {
    const root = render(<WeekItem state="scheduled" name="Tempo Run" onPress={jest.fn()} />);
    const chip = root.findByType(TouchableOpacity);
    const chipStyle = flatten(chip.props.style);
    expect(chipStyle.backgroundColor).toBe(colors.surface);
    expect(chipStyle.opacity).toBeUndefined();
    const views = root.findAllByType(View).map((node) => flatten(node.props.style));
    expect(views.some((style) => style.backgroundColor === colors.accent)).toBe(false);
  });

  it('renders a substituted chip with the leading accent bar', () => {
    const root = render(<WeekItem state="substituted" name="Tempo Run" onPress={jest.fn()} />);
    const views = root.findAllByType(View).map((node) => flatten(node.props.style));
    expect(views.some((style) => style.backgroundColor === colors.accent)).toBe(true);
  });

  it('renders a cancelled chip muted and struck through', () => {
    const root = render(<WeekItem state="cancelled" name="Leg Day" onPress={jest.fn()} />);
    const chip = root.findByType(TouchableOpacity);
    const chipStyle = flatten(chip.props.style);
    expect(chipStyle.backgroundColor).toBe(colors.surfaceMuted);
    expect(chipStyle.opacity).toBe(0.5);
    const name = root.findByType(Text);
    expect(flatten(name.props.style).textDecorationLine).toBe('line-through');
  });

  it('has no notes affordance of any kind', () => {
    const root = render(<WeekItem state="scheduled" name="Tempo Run" onPress={jest.fn()} />);
    expect(root.findAllByType(Text)).toHaveLength(1);
  });

  it('is pressable and fires the sheet handler', () => {
    const onPress = jest.fn();
    const root = render(<WeekItem state="scheduled" name="Tempo Run" onPress={onPress} />);
    act(() => {
      root.findByType(TouchableOpacity).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
