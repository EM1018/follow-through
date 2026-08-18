import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { Unit } from './units';
import { UNIT_LABELS } from './units';

/** Groups (already ordered time -> distance -> count) get extra breathing room between them; units within a group sit tight. */
export function UnitChips({
  groups,
  selected,
  onSelect,
}: {
  groups: Unit[][];
  selected: Unit | null;
  onSelect: (unit: Unit) => void;
}) {
  return (
    <View style={styles.row}>
      {groups.map((group, groupIndex) => (
        <View key={groupIndex} style={styles.group}>
          {group.map((unit) => {
            const active = unit === selected;
            return (
              <TouchableOpacity
                key={unit}
                onPress={() => onSelect(unit)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={UNIT_LABELS[unit].long}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{UNIT_LABELS[unit].long}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  group: {
    flexDirection: 'row',
    gap: spacing.xs,
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
