import { StyleSheet } from 'react-native';

import { colors, fontSize, fontWeight, spacing } from '@/theme';

/** Shared by every field row in the completion form (Amount, Activity, Note), in both the Log tab's sheet and the schedule's tap-then-add editor. */
export const fieldStyles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
});
