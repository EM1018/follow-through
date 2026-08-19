import { Text, View } from 'react-native';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { colors } from '@/theme';

import { DayStatusIndicator } from './DayStatusIndicator';

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

describe('DayStatusIndicator', () => {
  it('renders a hollow dot for a scheduled, uncompleted day', () => {
    const root = render(<DayStatusIndicator status="scheduled" completed={false} isLoading={false} />);
    const style = flatten(root.findByType(View).props.style);
    expect(style.borderColor).toBe(colors.accent);
    expect(style.backgroundColor).toBeUndefined();
  });

  it('renders a filled dot for a scheduled, completed day', () => {
    const root = render(<DayStatusIndicator status="scheduled" completed={true} isLoading={false} />);
    const style = flatten(root.findByType(View).props.style);
    expect(style.backgroundColor).toBe(colors.accent);
  });

  it('defaults to hollow when completed is omitted', () => {
    const root = render(<DayStatusIndicator status="scheduled" isLoading={false} />);
    const style = flatten(root.findByType(View).props.style);
    expect(style.backgroundColor).toBeUndefined();
  });

  it('renders the swap glyph in a hollow badge for a substituted, uncompleted day', () => {
    const root = render(<DayStatusIndicator status="substituted" completed={false} isLoading={false} />);
    expect(root.findByType(Text).props.children).toBe('⇄');
    const badgeStyle = flatten(root.findByType(View).props.style);
    expect(badgeStyle.borderColor).toBe(colors.accent);
    expect(badgeStyle.backgroundColor).toBeUndefined();
  });

  it('renders the swap glyph in a filled badge for a substituted, completed day -- same glyph, just filled', () => {
    const root = render(<DayStatusIndicator status="substituted" completed={true} isLoading={false} />);
    expect(root.findByType(Text).props.children).toBe('⇄');
    const badgeStyle = flatten(root.findByType(View).props.style);
    expect(badgeStyle.backgroundColor).toBe(colors.accent);
  });

  it('renders the cancelled glyph regardless of completed -- there is nothing to complete', () => {
    const root = render(<DayStatusIndicator status="cancelled" completed={true} isLoading={false} />);
    expect(root.findByType(Text).props.children).toBe('⊘');
  });

  it('renders nothing for an empty day', () => {
    const root = render(<DayStatusIndicator status="empty" isLoading={false} />);
    expect(root.children).toHaveLength(0);
  });

  it('renders nothing for an undefined status', () => {
    const root = render(<DayStatusIndicator status={undefined} isLoading={false} />);
    expect(root.children).toHaveLength(0);
  });

  it('renders a skeleton while loading, regardless of status', () => {
    const root = render(<DayStatusIndicator status="scheduled" completed={true} isLoading={true} />);
    expect(root.findAllByType(Text)).toHaveLength(0);
    expect(root.findByType(View)).toBeDefined();
  });
});
