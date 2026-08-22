import Svg, { Circle, Path } from 'react-native-svg';

import type { TabIconProps } from './types';

export function ProfileIcon({ size, color }: TabIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={2} />
      <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
