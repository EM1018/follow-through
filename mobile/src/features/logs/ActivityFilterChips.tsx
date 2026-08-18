import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { Activity, ActivityInfo } from './activities';

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Single-select, "All" always first. Built from activities present in the loaded rows -- see presentActivities. */
export function ActivityFilterChips({
  activities,
  selected,
  onSelect,
}: {
  activities: ActivityInfo[];
  selected: Activity | null;
  onSelect: (activity: Activity | null) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <Chip label="All" active={selected === null} onPress={() => onSelect(null)} />
      {activities.map((info) => (
        <Chip
          key={info.activity}
          label={info.display_name}
          active={selected === info.activity}
          onPress={() => onSelect(info.activity)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.background,
  },
});
