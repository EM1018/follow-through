import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, heroFontSize, segmentBar, spacing } from '@/theme';

import { circlesFor } from './circles';
import type { CommitmentRead } from './commitments';
import { GoalCircles } from './GoalCircles';
import { goalTrack } from './goalShape';
import { finishedWeekLabel, goalTermsLine, streakLabel } from './goalTerms';

type GoalCardProps = {
  commitment: CommitmentRead;
  variant: 'active' | 'finished';
  activityDisplayName: string;
  expanded: boolean;
  onPress: () => void;
};

/**
 * One component, three renderings: a collapsed row, an active (this-week-
 * first) expanded card, and a finished (terms-first) expanded card. A
 * finished goal has no current week, which is the entire reason the active
 * and finished expanded layouts differ -- the collapsed row is identical
 * either way, since it never shows a hero number to begin with.
 */
export function GoalCard({ commitment, variant, activityDisplayName, expanded, onPress }: GoalCardProps) {
  const track = goalTrack(commitment);
  // The last returned week is always "this week" for an active goal -- only
  // the most recent week can ever be in_progress, everything before it is
  // necessarily closed.
  const currentWeek = track.weeks[track.weeks.length - 1] ?? null;
  // Every week of a commitment asks for the same count, so it lives on the row, not the week.
  const sessionsRequired = commitment.sessions_per_week;
  const circles = circlesFor(track.weeks, commitment.duration_weeks);

  if (!expanded) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${activityDisplayName} goal`}
      >
        <Card style={styles.collapsedCard}>
          <Text style={styles.name} numberOfLines={1}>
            {activityDisplayName}
          </Text>
          <GoalCircles statuses={circles} size="mini" />
          {currentWeek ? (
            <Text style={styles.collapsedCount}>
              {currentWeek.sessions_done}/{sessionsRequired}
            </Text>
          ) : null}
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${activityDisplayName} goal, expanded`}
    >
      <Card style={styles.expandedCard}>
        {variant === 'active' ? (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.name}>{activityDisplayName}</Text>
              <Text style={styles.headerRight}>{goalTermsLine(commitment)}</Text>
            </View>

            {currentWeek ? (
              <>
                <View style={styles.hero}>
                  <Text style={styles.heroNumber}>{currentWeek.sessions_done}</Text>
                  <Text style={styles.heroSuffix}>of {sessionsRequired} this week</Text>
                </View>
                <View style={styles.segmentRow}>
                  {Array.from({ length: sessionsRequired }, (_, index) => (
                    <View
                      key={index}
                      style={[styles.segment, index < currentWeek.sessions_done && styles.segmentFilled]}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.divider} />
            <GoalCircles statuses={circles} size="normal" />
            <Text style={styles.streak}>{streakLabel(track.current_streak)}</Text>
          </>
        ) : (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.name}>{activityDisplayName}</Text>
              {commitment.duration_weeks !== null ? (
                <Text style={styles.headerRight}>{finishedWeekLabel(commitment.duration_weeks)}</Text>
              ) : null}
            </View>
            <Text style={styles.subtitle}>{goalTermsLine(commitment)}</Text>
            <GoalCircles statuses={circles} size="normal" />
            <View style={styles.divider} />
            <Text style={styles.streak}>{streakLabel(track.current_streak)}</Text>
          </>
        )}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  collapsedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  expandedCard: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  headerRight: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  collapsedCount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  heroNumber: {
    fontSize: heroFontSize,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  heroSuffix: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: segmentBar.gap,
  },
  segment: {
    flex: 1,
    height: segmentBar.height,
    borderRadius: segmentBar.height / 2,
    backgroundColor: colors.surfaceMuted,
  },
  segmentFilled: {
    backgroundColor: colors.accent,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  streak: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
});
