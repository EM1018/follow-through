import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, fontWeight, radius, segmentedControl, spacing } from '@/theme';

import type { ViewMode } from './viewMode';

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'month', label: 'Month' },
  { mode: 'week', label: 'Week' },
  { mode: 'day', label: 'Day' },
];

/** Month/Week/Day segmented control -- all three options visible, current one raised on a lighter pill. */
export function ViewModeControl({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {OPTIONS.map((option) => {
        const selected = option.mode === value;
        return (
          <Pressable
            key={option.mode}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => {
              if (!selected) {
                onChange(option.mode);
              }
            }}
            accessibilityRole="tab"
            accessibilityLabel={`${option.label} view`}
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: segmentedControl.trackPadding,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  segment: {
    width: segmentedControl.segmentWidth,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  segmentSelected: {
    backgroundColor: colors.background,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  labelSelected: {
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
});
