import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import {
  invalidatePlanScheduleData,
  useScheduleEntries,
  useWorkouts,
  type ScheduleEntryRead,
  type WorkoutRead,
} from '@/features/schedule/api';
import { workoutDeleteDialogCopy } from '@/features/schedule/deleteCopy';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { WorkoutEditSheet } from '@/features/schedule/WorkoutEditSheet';
import { scheduledDaysSummary } from '@/features/schedule/workoutSummary';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

const EMPTY_WORKOUTS: WorkoutRead[] = [];
const EMPTY_ENTRIES: ScheduleEntryRead[] = [];

function WorkoutRowSkeleton() {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Skeleton style={styles.skeletonName} />
        <Skeleton style={styles.skeletonMeta} />
      </View>
    </View>
  );
}

function WorkoutRow({
  workout,
  summary,
  onEdit,
  onDelete,
}: {
  workout: WorkoutRead;
  summary: string;
  onEdit: (workout: WorkoutRead) => void;
  onDelete: (workout: WorkoutRead) => void;
}) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.rowText}
        onPress={() => onEdit(workout)}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${workout.name}`}
      >
        <Text style={styles.name} numberOfLines={1}>
          {workout.name}
        </Text>
        {workout.notes ? (
          <Text style={styles.notes} numberOfLines={1}>
            {workout.notes}
          </Text>
        ) : null}
        <Text style={styles.summary}>{summary}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onDelete(workout)}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${workout.name}`}
      >
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function WorkoutsScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const queryClient = useQueryClient();
  const [editingWorkout, setEditingWorkout] = useState<WorkoutRead | null>(null);

  const workoutsQuery = useWorkouts(planId);
  const entriesQuery = useScheduleEntries(planId);

  // Stale-while-error: cached content (from either query) stays on screen
  // through a failed background refetch. A top-level error only appears
  // when neither query has ever succeeded.
  const hasWorkoutsData = workoutsQuery.data !== undefined;
  const hasEntriesData = entriesQuery.data !== undefined;
  const isInitialLoading =
    (workoutsQuery.isLoading && !hasWorkoutsData) || (entriesQuery.isLoading && !hasEntriesData);
  const initialError: ApiError | null = !hasWorkoutsData && workoutsQuery.isError
    ? workoutsQuery.error
    : !hasEntriesData && entriesQuery.isError
      ? entriesQuery.error
      : null;

  const workouts = workoutsQuery.data ?? EMPTY_WORKOUTS;
  const entries: ScheduleEntryRead[] = entriesQuery.data ?? EMPTY_ENTRIES;

  const workoutsById = useMemo(
    () => Object.fromEntries(workouts.map((workout) => [workout.id, workout])),
    [workouts],
  );

  const deleteMutation = useMutation<void, ApiError, WorkoutRead>({
    mutationFn: (workout) =>
      unwrap(
        api.DELETE('/plans/{plan_id}/workouts/{workout_id}', {
          params: { path: { plan_id: planId, workout_id: workout.id } },
        }),
      ),
    onSuccess: () => invalidatePlanScheduleData(queryClient, planId),
    onError: (error, workout) => {
      if (error.kind === 'not_found') {
        // Already gone -- refresh caches, nothing to surface.
        invalidatePlanScheduleData(queryClient, planId);
        return;
      }
      Alert.alert(`Couldn't delete ${workout.name}.`, 'Try again.');
    },
  });

  function confirmDelete(workout: WorkoutRead) {
    const { title, message } = workoutDeleteDialogCopy(workout.name, entries, workout.id, workoutsById);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(workout) },
    ]);
  }

  function retry() {
    workoutsQuery.refetch();
    entriesQuery.refetch();
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Workouts',
          // This screen is reached by pushing directly from the home stack, into a
          // Stack navigator (plans/_layout.tsx) that isn't nested under any Stack of
          // its own -- every layout above it is a bare Slot. That leaves this route
          // as its navigator's only history entry, so React Navigation has nothing
          // to render a back chevron for (and no swipe-back gesture either). Supply
          // headerLeft explicitly.
          //
          // dismissTo, not back(): the Tabs navigator doesn't push a history entry
          // when you switch tabs, so back() would walk the global history to the
          // tabs navigator's default tab rather than wherever the user actually
          // came from. That happens to be Schedule here too, which is exactly why
          // this was easy to miss -- see the same fix + explanation in
          // manage-goals/index.tsx, where the origin tab (Profile) isn't the
          // default one and the bug was actually visible.
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.dismissTo('/(app)/(tabs)')}
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
          <WorkoutRowSkeleton />
          <WorkoutRowSkeleton />
          <WorkoutRowSkeleton />
        </View>
      ) : null}

      {initialError ? (
        <View style={styles.centered}>
          <ScheduleErrorState error={initialError} onRetry={retry} />
        </View>
      ) : null}

      {!isInitialLoading && !initialError && workouts.length === 0 ? (
        <View style={styles.centered}>
          <EmptyState title="No workouts in this plan yet." subtitle="Add one from any day on the calendar." />
        </View>
      ) : null}

      {!isInitialLoading && !initialError && workouts.length > 0 ? (
        <FlatList
          data={workouts}
          keyExtractor={(workout) => workout.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: workout }) => (
            <WorkoutRow
              workout={workout}
              summary={scheduledDaysSummary(entries, workout.id)}
              onEdit={setEditingWorkout}
              onDelete={confirmDelete}
            />
          )}
        />
      ) : null}

      {editingWorkout ? (
        <WorkoutEditSheet planId={planId} workout={editingWorkout} onClose={() => setEditingWorkout(null)} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
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
  notes: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  summary: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  deleteText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
  skeletonName: {
    height: fontSize.md,
    width: '50%',
  },
  skeletonMeta: {
    height: fontSize.xs,
    width: '30%',
  },
});
