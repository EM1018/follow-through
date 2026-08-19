import { StyleSheet, Text, View } from 'react-native';

import type { DaySchedule } from '@/features/schedule/api';
import { colors, dotSize, fontSize } from '@/theme';

type DayStatusIndicatorProps = {
  status: DaySchedule['status'] | undefined;
  /** Absent (undefined) is treated the same as false -- callers without a fetched day yet have nothing to be completed. */
  completed?: boolean;
  isLoading: boolean;
};

/**
 * The same day-status glyph everywhere a calendar cell needs one -- Month
 * view and the Week strip must never disagree about what a given day looks
 * like, so both call this instead of drawing their own.
 *
 * Completion is a filled version of the existing glyph, not a replacement --
 * a substituted-and-completed day still reads as substituted, just filled.
 * Cancelled and empty have no completed variant; there's nothing to complete.
 */
export function DayStatusIndicator({ status, completed = false, isLoading }: DayStatusIndicatorProps) {
  if (isLoading) {
    return <View style={styles.dotSkeleton} />;
  }
  switch (status) {
    case 'scheduled':
      return <View style={[styles.dot, completed ? styles.dotFilled : styles.dotHollow]} />;
    case 'cancelled':
      return <Text style={styles.markCancelled}>⊘</Text>;
    case 'substituted':
      return (
        <View style={[styles.badge, completed ? styles.badgeFilled : styles.badgeHollow]}>
          <Text style={completed ? styles.markSubstitutedFilled : styles.markSubstituted}>⇄</Text>
        </View>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  dot: {
    width: dotSize.md,
    height: dotSize.md,
    borderRadius: dotSize.md / 2,
  },
  dotFilled: {
    backgroundColor: colors.accent,
  },
  dotHollow: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  dotSkeleton: {
    width: dotSize.md,
    height: dotSize.md,
    borderRadius: dotSize.md / 2,
    backgroundColor: colors.border,
  },
  badge: {
    width: dotSize.lg,
    height: dotSize.lg,
    borderRadius: dotSize.lg / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeFilled: {
    backgroundColor: colors.accent,
  },
  badgeHollow: {
    borderWidth: 1,
    borderColor: colors.accent,
  },
  markCancelled: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  markSubstituted: {
    fontSize: fontSize.xs,
    color: colors.accent,
  },
  markSubstitutedFilled: {
    fontSize: fontSize.xs,
    color: colors.background,
  },
});
