import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { useCommitments, type CommitmentRead } from '@/features/goals/commitments';
import { GoalActionsSheet } from '@/features/goals/GoalActionsSheet';
import { goalRowSubtitle, type GoalVariant } from '@/features/goals/manageGoalsCopy';
import { useActivities } from '@/features/logs/activities';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

type GoalRowData = { commitment: CommitmentRead; variant: GoalVariant };

function GoalRowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Skeleton style={styles.skeletonName} />
        <Skeleton style={styles.skeletonMeta} />
      </View>
    </View>
  );
}

// No progress circles, no hero line -- this screen is for administration,
// not motivation. The terms line exists only so two similar goals can be
// told apart, the same job goalRowSubtitle does for the Goals tab's cards.
function GoalRow({
  data,
  activityDisplayName,
  onMore,
}: {
  data: GoalRowData;
  activityDisplayName: string;
  onMore: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {activityDisplayName}
        </Text>
        <Text style={styles.subtitle}>{goalRowSubtitle(data.commitment, data.variant)}</Text>
      </View>
      <TouchableOpacity
        onPress={onMore}
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${activityDisplayName}`}
      >
        <Text style={styles.moreGlyph}>⋯</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ManageGoalsScreen() {
  const commitmentsQuery = useCommitments();
  const activitiesQuery = useActivities();
  const [actionsFor, setActionsFor] = useState<GoalRowData | null>(null);

  // Stale-while-error: cached content stays on screen through a failed
  // background refetch. A top-level error only appears when the query has
  // never once succeeded.
  const hasCache = commitmentsQuery.data !== undefined;
  const isInitialLoading = commitmentsQuery.isLoading && !hasCache;
  const initialError = !hasCache && commitmentsQuery.isError ? commitmentsQuery.error : null;

  const activitiesById = useMemo(
    () => new Map((activitiesQuery.data?.activities ?? []).map((info) => [info.activity, info])),
    [activitiesQuery.data],
  );
  function displayNameFor(commitment: CommitmentRead): string {
    return activitiesById.get(commitment.activity)?.display_name ?? commitment.activity;
  }

  const active = commitmentsQuery.data?.active ?? [];
  const finished = commitmentsQuery.data?.finished ?? [];
  const isEmpty = !isInitialLoading && !initialError && active.length === 0 && finished.length === 0;

  const sections: { title: string; data: GoalRowData[] }[] = [
    ...(active.length > 0
      ? [{ title: 'ACTIVE', data: active.map((commitment) => ({ commitment, variant: 'active' as const })) }]
      : []),
    ...(finished.length > 0
      ? [{ title: 'FINISHED', data: finished.map((commitment) => ({ commitment, variant: 'finished' as const })) }]
      : []),
  ];

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Manage goals',
          // Same reasoning as plans/[planId]/workouts.tsx: this route is
          // reached by pushing from a bare-Slot tab screen into a Stack
          // (this directory's own _layout.tsx) that has nothing above it to
          // borrow a back chevron from -- supply headerLeft explicitly.
          //
          // dismissTo, not back(): the Tabs navigator doesn't push a history
          // entry when you switch tabs, so back() walks the global history
          // to the tabs navigator's default tab (Schedule) rather than
          // Profile, the tab this screen was actually opened from. dismissTo
          // names the destination explicitly instead of trusting history.
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.dismissTo('/(app)/(tabs)/profile')}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.backLink}>Back</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {isInitialLoading ? (
        <View style={styles.list}>
          <GoalRowSkeleton />
          <GoalRowSkeleton />
        </View>
      ) : null}

      {initialError ? (
        <View style={styles.centered}>
          <ScheduleErrorState error={initialError} onRetry={() => commitmentsQuery.refetch()} />
        </View>
      ) : null}

      {isEmpty ? (
        <View style={styles.centered}>
          <EmptyState title="No goals yet." subtitle="Create one from the Goals tab." />
        </View>
      ) : null}

      {!isInitialLoading && !initialError && !isEmpty ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.commitment.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <GoalRow
              data={item}
              activityDisplayName={displayNameFor(item.commitment)}
              onMore={() => setActionsFor(item)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          stickySectionHeadersEnabled
        />
      ) : null}

      {actionsFor ? (
        <GoalActionsSheet
          commitment={actionsFor.commitment}
          activityDisplayName={displayNameFor(actionsFor.commitment)}
          variant={actionsFor.variant}
          onClose={() => setActionsFor(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backLink: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
    paddingHorizontal: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeaderWrap: {
    backgroundColor: colors.background,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  moreGlyph: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
    paddingHorizontal: spacing.sm,
  },
  skeletonName: {
    height: fontSize.md,
    width: '50%',
  },
  skeletonMeta: {
    height: fontSize.xs,
    width: '60%',
    marginTop: spacing.xs,
  },
});
