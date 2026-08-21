import { StyleSheet, View } from 'react-native';

import { circleSize, colors, spacing } from '@/theme';

import type { BlockStatus } from './commitments';

/**
 * filled = passed, hollow = missed, outlined accent = in_progress -- same
 * filled/hollow language DayStatusIndicator already uses for the schedule,
 * plus a third, accent-outlined state this screen is the first to need.
 */
export function GoalCircles({ statuses, size = 'normal' }: { statuses: BlockStatus[]; size?: 'normal' | 'mini' }) {
  const diameter = size === 'normal' ? circleSize.normal : circleSize.mini;
  return (
    <View style={styles.row}>
      {statuses.map((status, index) => (
        <View
          key={index}
          style={[
            { width: diameter, height: diameter, borderRadius: diameter / 2 },
            status === 'passed' && styles.filled,
            status === 'missed' && styles.hollow,
            status === 'in_progress' && styles.inProgress,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filled: {
    backgroundColor: colors.accent,
  },
  hollow: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  inProgress: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
});
