import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { sessionsPickerOptions } from './goalForm';

/** "How often" picker, 1-7 -- same list-sheet shape as ActivityPickerSheet, checkmarked selection. */
export function SessionsPickerSheet({
  selected,
  onSelect,
  onClose,
}: {
  selected: number;
  onSelect: (sessionsPerWeek: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <Card style={styles.sheet}>
            <Text style={styles.title}>How often</Text>
            <View style={styles.divider} />
            <View style={styles.list}>
              {sessionsPickerOptions().map((option) => {
                const isSelected = option.value === selected;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.row}
                    onPress={() => onSelect(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={option.label}
                  >
                    <Text style={styles.rowLabel}>{option.label}</Text>
                    {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
    maxHeight: '85%',
  },
  sheet: {
    gap: spacing.xs,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  rowLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  checkmark: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },
});
