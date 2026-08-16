import { Text, TouchableOpacity, View } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { colors } from '@/theme';

import { DayItem } from './DayItem';

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

describe('DayItem', () => {
  it('renders a scheduled row as a filled background with the primary text color', () => {
    const root = render(<DayItem state="scheduled" name="Tempo Run" onPress={jest.fn()} />);
    const row = root.findByType(TouchableOpacity);
    const rowStyle = flatten(row.props.style);
    expect(rowStyle.backgroundColor).toBe(colors.background);
    expect(rowStyle.opacity).toBeUndefined();

    const name = root.findAllByType(Text)[0];
    expect(name.props.children).toBe('Tempo Run');
    const nameStyle = flatten(name.props.style);
    expect(nameStyle.color).toBe(colors.text);
    expect(nameStyle.textDecorationLine).toBeUndefined();
  });

  it('renders a substituted row with a leading accent bar and an "instead of" line', () => {
    const root = render(
      <DayItem state="substituted" name="Tempo Run" replacedName="Push Day" onPress={jest.fn()} />,
    );
    const views = root.findAllByType(View).map((node) => flatten(node.props.style));
    expect(views.some((style) => style.backgroundColor === colors.accent)).toBe(true);

    const texts = root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toContain('Tempo Run');
    expect(texts.some((child) => Array.isArray(child) && child.join('') === 'instead of Push Day')).toBe(true);
  });

  it('renders a cancelled row as muted, struck through, and reduced opacity, with no notes', () => {
    const root = render(
      <DayItem state="cancelled" name="Leg Day" notes="Go heavy" onPress={jest.fn()} />,
    );
    const row = root.findByType(TouchableOpacity);
    const rowStyle = flatten(row.props.style);
    expect(rowStyle.backgroundColor).toBe(colors.surfaceMuted);
    expect(rowStyle.opacity).toBe(0.5);

    const name = root.findAllByType(Text)[0];
    const nameStyle = flatten(name.props.style);
    expect(nameStyle.textDecorationLine).toBe('line-through');

    const texts = root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).not.toContain('Go heavy');
  });

  it('is pressable and fires the sheet handler', () => {
    const onPress = jest.fn();
    const root = render(<DayItem state="scheduled" name="Tempo Run" onPress={onPress} />);
    act(() => {
      root.findByType(TouchableOpacity).props.onPress();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ellipsizes long names on a single line rather than wrapping', () => {
    const root = render(
      <DayItem state="scheduled" name="A very long workout name that should not wrap" onPress={jest.fn()} />,
    );
    const name = root.findAllByType(Text)[0];
    expect(name.props.numberOfLines).toBe(1);
  });

  it('renders notes as a two-line clamped secondary line when present', () => {
    const root = render(<DayItem state="scheduled" name="Tempo Run" notes="  Negative split the back half  " onPress={jest.fn()} />);
    const texts = root.findAllByType(Text);
    const notesNode = texts.find((node) => node.props.children === 'Negative split the back half');
    expect(notesNode).toBeDefined();
    expect(notesNode!.props.numberOfLines).toBe(2);
  });

  it.each([null, undefined, '', '   '])('renders no notes line for %p', (notes) => {
    const root = render(<DayItem state="scheduled" name="Tempo Run" notes={notes} onPress={jest.fn()} />);
    const texts = root.findAllByType(Text).map((node) => node.props.children);
    expect(texts).toEqual(['Tempo Run']);
  });
});
