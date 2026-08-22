import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { TabIconProps } from './types';

export function ScheduleIcon({ size, color }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={4.5} width={18} height={16.5} rx={3.5} stroke={color} strokeWidth={2} />
      <Path d="M7.5 2.5v3M16.5 2.5v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M3 9.5h18" stroke={color} strokeWidth={2} />
      <Circle cx={8} cy={15} r={1.1} fill={color} />
      <Circle cx={12} cy={15} r={1.1} fill={color} />
      <Circle cx={16} cy={15} r={1.1} fill={color} />
    </Svg>
  );
}
