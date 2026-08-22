import Svg, { Circle } from 'react-native-svg';

import type { TabIconProps } from './types';

export function GoalsIcon({ size, color }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={5} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={2.1} fill={color} />
    </Svg>
  );
}
