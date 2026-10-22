import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useActivities } from '@/features/logs/activities';
import { useGoalCards, type CommitmentRead } from '@/features/goals/commitments';
import {
  EMPTY_GOALS_SUBTITLE,
  EMPTY_GOALS_TITLE,
  NEW_GOAL_BUTTON_LABEL,
  NO_SOLO_GOALS,
} from '@/features/goals/goalCopy';
import { GoalCard } from '@/features/goals/GoalCard';
import { GoalsSkeleton } from '@/features/goals/GoalsSkeleton';
import { NewGoalSheet } from '@/features/goals/NewGoalSheet';
import { GoalFilterChips } from '@/features/goals/GoalFilterChips';
import {
  defaultExpandedId,
  filterSections,
  hasAnyChallenge,
  partitionCards,
  runningChallengeCount,
  type GoalFilter,
} from '@/features/goals/sections';
import { CHALLENGE_CAP, CHALLENGE_CAP_LINE } from '@/features/goals/challengeCopy';
import { useDelayedVisible } from '@/features/goals/useDelayedVisible';
import { shouldShowEmptyState, shouldShowSkeleton } from '@/features/goals/viewState';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { colors, fontSize, fontWeight, spacing } from '@/theme';

export default function GoalsScreen() {
  const query = useGoalCards();
  const activitiesQuery = useActivities();

  const hasCache = query.data !== undefined;
  const sections = useMemo(
    () => partitionCards(query.data ?? { active: [], finished: [] }),
    [query.data],
  );
  // Unfiltered: the empty state means "nothing at all", never "nothing under this chip".
  const totalCount = sections.invites.length + sections.active.length + sections.finished.length;

  // No challenges, no chips -- and no filter left hiding rows if the last
  // challenge goes away while Solo or Friends is selected.
  const showChips = hasAnyChallenge(sections);
  const [filter, setFilter] = useState<GoalFilter>('all');
  const effectiveFilter: GoalFilter = showChips ? filter : 'all';
  const visible = useMemo(() => filterSections(sections, effectiveFilter), [sections, effectiveFilter]);
  const { invites, active, finished } = visible;
  const visibleCount = invites.length + active.length + finished.length;

  // Over every row, not the chip-filtered ones -- Solo must never hide a
  // running challenge from the count. Display only: the server re-checks.
  const atChallengeCap = runningChallengeCount(sections) >= CHALLENGE_CAP;

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

  // The expanded card is whichever the user last tapped, or the top card with
  // progress on a cold open -- never everything-collapsed, which would turn
  // this into a table of contents instead of a screen you can act on immediately.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const effectiveExpandedId = expandedId ?? defaultExpandedId(visible);

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

          {showChips ? <GoalFilterChips selected={effectiveFilter} onSelect={setFilter} /> : null}

          {/* Only Solo can come up empty: Friends is offered only when a challenge exists. */}
          {visibleCount === 0 ? <Text style={styles.filteredEmpty}>{NO_SOLO_GOALS}</Text> : null}

          {invites.length > 0 ? (
            <>
              <Text style={styles.sectionHeader}>Invites · {invites.length}</Text>
              {atChallengeCap ? <Text style={styles.capLine}>{CHALLENGE_CAP_LINE}</Text> : null}
              {invites.map((commitment) => (
                <GoalCard
                  key={commitment.id}
                  commitment={commitment}
                  variant="active"
                  activityDisplayName={displayNameFor(commitment)}
                  expanded={false}
                  onPress={() => {}}
                  acceptBlocked={atChallengeCap}
                />
              ))}
            </>
          ) : null}

          {/* Only needs a label when Invites sits above it -- otherwise it's the screen's own list. */}
          {invites.length > 0 && active.length > 0 ? <Text style={styles.sectionHeader}>Active</Text> : null}

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
  capLine: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  filteredEmpty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  sectionHeader: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
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
