import { StyleSheet, Text, View } from 'react-native';

import type { DaySchedule } from '@/features/schedule/api';
import { colors, dotSize, fontSize } from '@/theme';

type DayStatusIndicatorProps = {
  status: DaySchedule['status'] | undefined;
  isLoading: boolean;
};

/**
 * The same day-status glyph everywhere a calendar cell needs one -- Month
 * view and the Week strip must never disagree about what a given day looks
 * like, so both call this instead of drawing their own.
 */
export function DayStatusIndicator({ status, isLoading }: DayStatusIndicatorProps) {
  if (isLoading) {
    return <View style={styles.dotSkeleton} />;
  }
  switch (status) {
    case 'scheduled':
      return <View style={styles.dotScheduled} />;
    case 'cancelled':
      return <Text style={styles.markCancelled}>⊘</Text>;
    case 'substituted':
      return <Text style={styles.markSubstituted}>⇄</Text>;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  dotScheduled: {
    width: dotSize.md,
    height: dotSize.md,
    borderRadius: dotSize.md / 2,
    backgroundColor: colors.accent,
  },
  dotSkeleton: {
    width: dotSize.md,
    height: dotSize.md,
    borderRadius: dotSize.md / 2,
    backgroundColor: colors.border,
  },
  markCancelled: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  markSubstituted: {
    fontSize: fontSize.xs,
    color: colors.accent,
  },
});
