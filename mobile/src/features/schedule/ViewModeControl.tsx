import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { ViewMode } from './viewMode';

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'month', label: 'Month' },
  { mode: 'week', label: 'Week' },
  { mode: 'day', label: 'Day' },
];

export function ViewModeControl({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const currentLabel = OPTIONS.find((option) => option.mode === value)?.label ?? 'Day';

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setIsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityLabel="Change calendar view"
      >
        <Text style={styles.triggerText}>{currentLabel}</Text>
        <Text style={styles.chevron}>{isOpen ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      {isOpen ? (
        <View style={styles.menu}>
          {OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.mode}
              style={styles.menuItem}
              onPress={() => {
                onChange(option.mode);
                setIsOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.menuItemText, option.mode === value && styles.menuItemTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  triggerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  chevron: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  menu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: spacing.xs,
    minWidth: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
  },
  menuItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuItemText: {
    fontSize: fontSize.sm,
    color: colors.text,
  },
  menuItemTextActive: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
});
