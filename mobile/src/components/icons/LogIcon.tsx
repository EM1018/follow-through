import Svg, { Rect } from 'react-native-svg';

import type { TabIconProps } from './types';

const COLUMNS = [0, 1, 2];
const ROWS = [0, 1, 2];

const CELL = 6;
const GAP = 2;
const ORIGIN = 1; // (6 * 3) + (2 * 2) = 22, centered in a 24 viewBox

/**
 * Nine rounded cells in a checkerboard pattern, mirroring the contribution
 * graph on the Log tab. The four edge-midpoint cells (top, right, bottom,
 * left) are filled; the four corners and the center are outlines -- matching
 * the approved mockup, not a mostly-solid block with a single hole.
 */
export function LogIcon({ size, color }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {ROWS.map((row) =>
        COLUMNS.map((column) => {
          const isHollow = (row + column) % 2 === 0;
          return (
            <Rect
              key={`${row}-${column}`}
              x={ORIGIN + column * (CELL + GAP)}
              y={ORIGIN + row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={1.5}
              fill={isHollow ? 'none' : color}
              stroke={isHollow ? color : undefined}
              strokeWidth={isHollow ? 1.75 : undefined}
            />
          );
        }),
      )}
    </Svg>
  );
}
