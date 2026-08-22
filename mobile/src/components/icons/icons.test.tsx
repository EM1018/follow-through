import { Circle, Path, Rect } from 'react-native-svg';
import renderer, { act, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';

import { GoalsIcon, LogIcon, ProfileIcon, ScheduleIcon } from './index';
import type { TabIconProps } from './types';

function render(element: React.ReactElement): ReactTestInstance {
  let tree: ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  return tree!.root;
}

const ICONS: { name: string; Component: (props: TabIconProps) => React.ReactElement }[] = [
  { name: 'ScheduleIcon', Component: ScheduleIcon },
  { name: 'LogIcon', Component: LogIcon },
  { name: 'GoalsIcon', Component: GoalsIcon },
  { name: 'ProfileIcon', Component: ProfileIcon },
];

describe('tab icons', () => {
  it.each(ICONS)('$name renders without throwing given a size and a color', ({ Component }) => {
    expect(() => render(<Component size={24} color="#208AEF" />)).not.toThrow();
  });

  it("LogIcon renders exactly nine Rect elements, exactly five with fill='none' (the corners and center)", () => {
    const root = render(<LogIcon size={24} color="#208AEF" />);
    const rects = root.findAllByType(Rect);
    expect(rects).toHaveLength(9);
    expect(rects.filter((r) => r.props.fill === 'none')).toHaveLength(5);
  });

  it('ScheduleIcon applies the given color to its stroked and filled shapes', () => {
    const root = render(<ScheduleIcon size={24} color="#123456" />);
    expect(root.findByType(Rect).props.stroke).toBe('#123456');
    root.findAllByType(Path).forEach((path) => expect(path.props.stroke).toBe('#123456'));
    root.findAllByType(Circle).forEach((circle) => expect(circle.props.fill).toBe('#123456'));
  });

  it('LogIcon applies the given color to both filled cells and the hollow (corner/center) cells', () => {
    const root = render(<LogIcon size={24} color="#123456" />);
    root.findAllByType(Rect).forEach((rect) => {
      if (rect.props.fill === 'none') {
        expect(rect.props.stroke).toBe('#123456');
      } else {
        expect(rect.props.fill).toBe('#123456');
      }
    });
  });

  it('GoalsIcon applies the given color to its rings and center dot', () => {
    const root = render(<GoalsIcon size={24} color="#123456" />);
    const circles = root.findAllByType(Circle);
    expect(circles).toHaveLength(3);
    circles.forEach((circle) => {
      const applied = circle.props.stroke ?? circle.props.fill;
      expect(applied).toBe('#123456');
    });
  });

  it('ProfileIcon applies the given color to its head and shoulders', () => {
    const root = render(<ProfileIcon size={24} color="#123456" />);
    expect(root.findByType(Circle).props.stroke).toBe('#123456');
    expect(root.findByType(Path).props.stroke).toBe('#123456');
  });
});
