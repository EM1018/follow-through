import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { useWorkouts, type WorkoutRead } from './api';
import { ScheduleErrorState } from './ScheduleErrorState';
import { pickerEmptyMessage } from './workoutPicker';

const EMPTY_WORKOUTS: WorkoutRead[] = [];

function WorkoutRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton style={styles.skeletonName} />
    </View>
  );
}

function WorkoutRow({
  workout,
  isCurrent,
  onPress,
}: {
  workout: WorkoutRead;
  isCurrent: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, isCurrent && styles.rowDisabled]}
      onPress={onPress}
      disabled={isCurrent}
      accessibilityRole="button"
      accessibilityState={{ disabled: isCurrent }}
      accessibilityLabel={workout.name}
    >
      <Text style={styles.rowName} numberOfLines={1}>
        {workout.name}
      </Text>
      {isCurrent ? <Badge label="Current" variant="muted" /> : null}
    </TouchableOpacity>
  );
}

/**
 * Its own sheet rather than a mode of AddWorkoutModal -- repeat, weekday
 * circles, and date bounds are all meaningless for a single-day swap.
 * `currentWorkoutId` is whatever's on the day being swapped (null when
 * swapping a cancelled day, since nothing is currently shown); it's excluded
 * from selection, never the thing you swap a day for.
 */
export function WorkoutPickerSheet({
  planId,
  date,
  currentWorkoutId,
  onSelect,
  onClose,
}: {
  planId: string;
  date: Date;
  currentWorkoutId: string | null;
  onSelect: (workoutId: string) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [newWorkoutName, setNewWorkoutName] = useState('');

  const workoutsQuery = useWorkouts(planId);
  const hasData = workoutsQuery.data !== undefined;
  const isInitialLoading = workoutsQuery.isLoading && !hasData;
  const initialError: ApiError | null = !hasData && workoutsQuery.isError ? workoutsQuery.error : null;
  const workouts = workoutsQuery.data ?? EMPTY_WORKOUTS;

  const emptyMessage = pickerEmptyMessage(workouts, currentWorkoutId);
  const showList = !isInitialLoading && !initialError && emptyMessage === null;
  const showEmptyState = !isInitialLoading && !initialError && emptyMessage !== null;

  const createWorkoutMutation = useMutation<WorkoutRead, ApiError, string>({
    mutationFn: (name) =>
      unwrap(
        api.POST('/plans/{plan_id}/workouts', {
          params: { path: { plan_id: planId } },
          body: { name, notes: null },
        }),
      ),
    onSuccess: (workout) => {
      queryClient.invalidateQueries({ queryKey: ['plans', planId, 'workouts'] });
      onSelect(workout.id);
    },
    onError: () => {
      Alert.alert("Couldn't create workout.", 'Try again.');
    },
  });

  const canCreate = newWorkoutName.trim().length > 0 && !createWorkoutMutation.isPending;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <Card style={styles.sheet}>
            <Text style={styles.title}>Choose a workout</Text>
            <Text style={styles.subtitle}>{format(date, 'EEEE, MMMM d')}</Text>

            <View style={styles.divider} />

            {isInitialLoading ? (
              <View style={styles.list}>
                <WorkoutRowSkeleton />
                <WorkoutRowSkeleton />
                <WorkoutRowSkeleton />
              </View>
            ) : null}

            {initialError ? <ScheduleErrorState error={initialError} onRetry={workoutsQuery.refetch} /> : null}

            {showEmptyState ? <Text style={styles.emptyText}>{emptyMessage}</Text> : null}

            {showList ? (
              <View style={styles.list}>
                {workouts.map((workout) => (
                  <WorkoutRow
                    key={workout.id}
                    workout={workout}
                    isCurrent={workout.id === currentWorkoutId}
                    onPress={() => onSelect(workout.id)}
                  />
                ))}
              </View>
            ) : null}

            <View style={styles.divider} />

            <View style={styles.newWorkoutRow}>
              <TextInput
                style={styles.newWorkoutInput}
                value={newWorkoutName}
                onChangeText={setNewWorkoutName}
                placeholder="New workout name"
                placeholderTextColor={colors.textMuted}
              />
              <Button
                label="Add"
                variant="secondary"
                onPress={() => createWorkoutMutation.mutate(newWorkoutName.trim())}
                disabled={!canCreate}
                loading={createWorkoutMutation.isPending}
              />
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
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
  rowDisabled: {
    opacity: 0.5,
  },
  rowName: {
    flexShrink: 1,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  skeletonName: {
    height: fontSize.md,
    width: '50%',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  newWorkoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  newWorkoutInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
});
