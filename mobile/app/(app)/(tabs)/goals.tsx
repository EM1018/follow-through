import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useActivities } from '@/features/logs/activities';
import { useCommitments, type CommitmentRead } from '@/features/goals/commitments';
import { EMPTY_GOALS_SUBTITLE, EMPTY_GOALS_TITLE, NEW_GOAL_BUTTON_LABEL } from '@/features/goals/goalCopy';
import { GoalCard } from '@/features/goals/GoalCard';
import { GoalsSkeleton } from '@/features/goals/GoalsSkeleton';
import { NewGoalSheet } from '@/features/goals/NewGoalSheet';
import { useDelayedVisible } from '@/features/goals/useDelayedVisible';
import { shouldShowEmptyState, shouldShowSkeleton } from '@/features/goals/viewState';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

export default function GoalsScreen() {
  const query = useCommitments();
  const activitiesQuery = useActivities();

  const hasCache = query.data !== undefined;
  const active = query.data?.active ?? [];
  const finished = query.data?.finished ?? [];
  const totalCount = active.length + finished.length;

  const delayedLoading = useDelayedVisible(query.isLoading);
  const showSkeleton = shouldShowSkeleton(hasCache, delayedLoading);
  const showEmpty = shouldShowEmptyState(hasCache, totalCount, query.isFetching);
  const showTopLevelError = query.isError && !hasCache;

  const activitiesById = useMemo(
    () => new Map((activitiesQuery.data?.activities ?? []).map((info) => [info.activity, info])),
    [activitiesQuery.data],
  );
  function displayNameFor(commitment: CommitmentRead): string {
    return activitiesById.get(commitment.activity)?.display_name ?? commitment.activity;
  }

  // The expanded card is whichever the user last tapped, or the top active
  // card on a cold open -- never everything-collapsed, which would turn this
  // into a table of contents instead of a screen you can act on immediately.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const effectiveExpandedId = expandedId ?? active[0]?.id ?? finished[0]?.id ?? null;

  const [finishedOpen, setFinishedOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  function toggleCard(id: string) {
    setExpandedId(effectiveExpandedId === id ? null : id);
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Goals</Text>
        <TouchableOpacity
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="New goal"
        >
          <Text style={styles.addIcon}>⊕</Text>
        </TouchableOpacity>
      </View>

      {showSkeleton ? (
        <View style={styles.padded}>
          <GoalsSkeleton />
        </View>
      ) : null}

      {showTopLevelError ? (
        <View style={styles.centered}>
          <ScheduleErrorState error={query.error} onRetry={() => query.refetch()} />
        </View>
      ) : null}

      {showEmpty ? (
        <View style={styles.centered}>
          <EmptyState
            title={EMPTY_GOALS_TITLE}
            subtitle={EMPTY_GOALS_SUBTITLE}
            action={<Button label={NEW_GOAL_BUTTON_LABEL} onPress={() => setSheetOpen(true)} />}
          />
        </View>
      ) : null}

      {hasCache && totalCount > 0 ? (
        <ScrollView contentContainerStyle={styles.list}>
          {query.isError ? (
            <ScheduleErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : null}

          {active.map((commitment) => (
            <GoalCard
              key={commitment.id}
              commitment={commitment}
              variant="active"
              activityDisplayName={displayNameFor(commitment)}
              expanded={effectiveExpandedId === commitment.id}
              onPress={() => toggleCard(commitment.id)}
            />
          ))}

          {finished.length > 0 ? (
            <>
              <TouchableOpacity
                style={styles.finishedRow}
                onPress={() => setFinishedOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel={`Finished, ${finished.length}`}
              >
                <Text style={styles.finishedRowText}>Finished · {finished.length}</Text>
                <Text style={styles.finishedRowChevron}>{finishedOpen ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>

              {finishedOpen
                ? finished.map((commitment) => (
                    <GoalCard
                      key={commitment.id}
                      commitment={commitment}
                      variant="finished"
                      activityDisplayName={displayNameFor(commitment)}
                      expanded={effectiveExpandedId === commitment.id}
                      onPress={() => toggleCard(commitment.id)}
                    />
                  ))
                : null}
            </>
          ) : null}
        </ScrollView>
      ) : null}

      {sheetOpen ? (
        <NewGoalSheet
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            query.refetch();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  addIcon: {
    fontSize: fontSize.xl,
    color: colors.accent,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  list: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  finishedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  finishedRowText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
  },
  finishedRowChevron: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
});
