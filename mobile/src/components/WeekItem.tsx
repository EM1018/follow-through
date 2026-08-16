import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, fontWeight, minRowHeight, radius, spacing } from '@/theme';

export type WeekItemState = 'scheduled' | 'substituted' | 'cancelled';

type WeekItemProps = {
  state: WeekItemState;
  name: string;
  onPress: () => void;
};

/**
 * Compact sibling of DayItem for the narrow Week view column. No notes --
 * the revised design keeps notes out of Week view entirely, unlike the
 * DayItem row.
 */
export function WeekItem({ state, name, onPress }: WeekItemProps) {
  const cancelled = state === 'cancelled';
  const substituted = state === 'substituted';

  return (
    <TouchableOpacity
      style={[styles.chip, cancelled && styles.chipCancelled]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={cancelled ? `Manage ${name}, cancelled` : `Manage ${name}`}
    >
      {substituted ? <View style={styles.accentBar} /> : null}
      <Text style={[styles.name, cancelled && styles.nameCancelled]} numberOfLines={1}>
        {name}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minRowHeight.week,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  chipCancelled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.5,
  },
  accentBar: {
    alignSelf: 'stretch',
    width: spacing.xs,
    backgroundColor: colors.accent,
  },
  name: {
    flexShrink: 1,
    paddingHorizontal: spacing.xs,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  nameCancelled: {
    textDecorationLine: 'line-through',
  },
});
