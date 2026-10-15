import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, fontWeight, spacing } from '@/theme';

import type { WeekCircle } from './circles';
import { GoalCircles } from './GoalCircles';
import { CHALLENGE_YOU_LABEL } from './goalCopy';

/**
 * A challenge's two week rows: you, then them -- in the order the server
 * oriented them, never by who created the challenge. Both rows are plain
 * GoalCircles over columns challengeRows() already lined up, so the circle
 * look and the week mapping are the goal card's own. Labels sit above each
 * row rather than beside it, so the circles start at the same x without a
 * fixed label width.
 */
export function ChallengeTracks({
  you,
  them,
  themLabel,
  size,
}: {
  you: WeekCircle[];
  them: WeekCircle[];
  themLabel: string;
  size: 'normal' | 'mini';
}) {
  const labelled = size === 'normal';
  return (
    <View style={labelled ? styles.rowsNormal : styles.rowsMini}>
      <View testID="challenge-track-you" style={styles.row}>
        {labelled ? <Text style={styles.label}>{CHALLENGE_YOU_LABEL}</Text> : null}
        <GoalCircles statuses={you} size={size} />
      </View>
      <View testID="challenge-track-them" style={styles.row}>
        {labelled ? <Text style={styles.label}>{themLabel}</Text> : null}
        <GoalCircles statuses={them} size={size} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowsNormal: {
    gap: spacing.sm,
  },
  rowsMini: {
    gap: spacing.xs,
  },
  row: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
});
