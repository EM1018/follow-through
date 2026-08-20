import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import type { Activity, ActivityInfo } from './activities';

/**
 * Listed in the response's own order, checkmarked selection, no default --
 * nothing is preselected. `allowClear` adds a leading "No activity" row that
 * calls `onClear` -- only meaningful where the activity is optional (a
 * workout's tag), never shown where it's required (logging one directly).
 */
export function ActivityPickerSheet({
  activities,
  selected,
  onSelect,
  onClose,
  allowClear = false,
  onClear,
}: {
  activities: ActivityInfo[];
  selected: Activity | null;
  onSelect: (activity: Activity) => void;
  onClose: () => void;
  allowClear?: boolean;
  onClear?: () => void;
}) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <Card style={styles.sheet}>
            <Text style={styles.title}>Activity</Text>
            <View style={styles.divider} />
            <View style={styles.list}>
              {allowClear ? (
                <TouchableOpacity
                  style={styles.row}
                  onPress={onClear}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === null }}
                  accessibilityLabel="No activity"
                >
                  <Text style={[styles.rowName, styles.rowNameMuted]}>No activity</Text>
                  {selected === null ? <Text style={styles.checkmark}>✓</Text> : null}
                </TouchableOpacity>
              ) : null}
              {activities.map((info) => {
                const isSelected = info.activity === selected;
                return (
                  <TouchableOpacity
                    key={info.activity}
                    style={styles.row}
                    onPress={() => onSelect(info.activity)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={info.display_name}
                  >
                    <Text style={styles.rowName}>{info.display_name}</Text>
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
  rowName: {
    flexShrink: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  rowNameMuted: {
    color: colors.textMuted,
  },
  checkmark: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },
});
