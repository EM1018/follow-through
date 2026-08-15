import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import {
  invalidatePlanScheduleData,
  useSchedule,
  useScheduleEntries,
  useWorkouts,
  type EntryRef,
  type ResolvedEntry,
  type ScheduleResponse,
  type WorkoutRead,
} from './api';
import {
  actionsFor,
  dependentsOf,
  findCancellationEntry,
  rootEntryOf,
  WEEKDAY_NAMES,
  type Action,
  type ScheduleEntry,
} from './blastRadius';
import { entryDeleteDialogCopy, restoreDialogCopy, undoSwapDialogCopy } from './deleteCopy';
import { cancellationPayload, replacementPayload, type ScheduleEntryCreate } from './entryPayload';
import { applyOptimisticCancel } from './scheduleCache';
import { WorkoutPickerSheet } from './WorkoutPickerSheet';

const EMPTY_ENTRIES: never[] = [];
const EMPTY_WORKOUTS: WorkoutRead[] = [];

export type EntryTarget = { kind: 'resolved'; entry: ResolvedEntry } | { kind: 'cancelled'; target: EntryRef };

type PickerAction = 'swap' | 'changeSwap';

/**
 * Shared by Change swap and Cancel-from-substituted: the existing row has to
 * go before the new one can take effect (see cancelSubstitutedMutation for
 * why). Sequential, not atomic -- callers report `created: false` honestly
 * rather than rolling the delete back.
 */
async function replaceExisting(
  planId: string,
  existingId: string,
  body: ScheduleEntryCreate,
): Promise<{ created: boolean }> {
  await unwrap(
    api.DELETE('/plans/{plan_id}/schedule-entries/{entry_id}', {
      params: { path: { plan_id: planId, entry_id: existingId } },
    }),
  );
  try {
    await unwrap(
      api.POST('/plans/{plan_id}/schedule-entries', { params: { path: { plan_id: planId } }, body }),
    );
    return { created: true };
  } catch {
    return { created: false };
  }
}

function actionLabel(action: Action, entry: ScheduleEntry): string {
  switch (action) {
    case 'cancel':
      return 'Cancel this day';
    case 'restore':
      return 'Restore this day';
    case 'swap':
      return 'Swap this day';
    case 'changeSwap':
      return 'Change swap';
    case 'undoSwap':
      return 'Undo swap';
    case 'delete':
      return entry.day_of_week !== null ? `Delete every ${WEEKDAY_NAMES[entry.day_of_week]}` : 'Delete this day';
  }
}

// Parent conditionally mounts this component (see AddWorkoutModal's note),
// so a fresh mount every open is guaranteed.
export function EntryActionsSheet({
  planId,
  date,
  target,
  onClose,
}: {
  planId: string;
  date: Date;
  target: EntryTarget;
  onClose: () => void;
}) {
  const dateParam = format(date, 'yyyy-MM-dd');
  const scheduleKey = ['plans', planId, 'schedule'] as const;
  const queryClient = useQueryClient();
  const dayQuery = useSchedule(planId, date, date);
  const entriesQuery = useScheduleEntries(planId);
  const workoutsQuery = useWorkouts(planId);
  const [pickerAction, setPickerAction] = useState<PickerAction | null>(null);

  const day = dayQuery.data?.days[dateParam];
  const entries = entriesQuery.data ?? EMPTY_ENTRIES;
  const workouts = workoutsQuery.data ?? EMPTY_WORKOUTS;
  const workoutsById = useMemo(() => Object.fromEntries(workouts.map((w) => [w.id, w])), [workouts]);

  const rawEntry = useMemo(
    () =>
      target.kind === 'cancelled'
        ? findCancellationEntry(entries, dateParam, target.target.entry_id)
        : entries.find((e) => e.id === target.entry.entry_id),
    [entries, target, dateParam],
  );
  const root = rawEntry ? rootEntryOf(entries, rawEntry) : undefined;
  const actions = day && rawEntry ? actionsFor(day, rawEntry) : [];

  const displayName = target.kind === 'cancelled' ? target.target.name : target.entry.name;
  const workoutName = displayName ?? 'a deleted workout';

  const invalidateAndClose = () => {
    invalidatePlanScheduleData(queryClient, planId);
    onClose();
  };

  const deleteMutation = useMutation<void, ApiError, string>({
    mutationFn: (entryId) =>
      unwrap(
        api.DELETE('/plans/{plan_id}/schedule-entries/{entry_id}', {
          params: { path: { plan_id: planId, entry_id: entryId } },
        }),
      ),
    onSuccess: invalidateAndClose,
    onError: (error) => {
      if (error.kind === 'not_found') {
        invalidateAndClose();
        return;
      }
      Alert.alert(`Couldn't remove ${workoutName}.`, 'Try again.');
    },
  });

  const removeAllMutation = useMutation<{ succeeded: number; total: number }, never, string[]>({
    mutationFn: async (entryIds) => {
      const results = await Promise.allSettled(
        entryIds.map((entryId) =>
          unwrap(
            api.DELETE('/plans/{plan_id}/schedule-entries/{entry_id}', {
              params: { path: { plan_id: planId, entry_id: entryId } },
            }),
          ),
        ),
      );
      return { succeeded: results.filter((r) => r.status === 'fulfilled').length, total: entryIds.length };
    },
    onSettled: invalidateAndClose,
    onSuccess: ({ succeeded, total }) => {
      if (succeeded < total) {
        Alert.alert('Partially removed', `Removed ${succeeded} of ${total} days. Try again for the rest.`);
      }
    },
  });

  function confirmDelete() {
    if (!rawEntry) {
      return;
    }
    const { title, message, siblings } = entryDeleteDialogCopy(workoutName, rawEntry, entries, workoutsById);

    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: 'Cancel', style: 'cancel' }];
    if (siblings.length > 0) {
      const allIds = [rawEntry.id, ...siblings.map((sibling) => sibling.id)];
      buttons.push({
        text: `Remove all ${allIds.length} days`,
        onPress: () => removeAllMutation.mutate(allIds),
      });
    }
    buttons.push({ text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(rawEntry.id) });

    Alert.alert(title, message, buttons);
  }

  // Cancel from a plain scheduled root: a single dated create, optimistic --
  // reversible from this same sheet, so no confirmation.
  const cancelMutation = useMutation<
    ScheduleEntry,
    ApiError,
    void,
    { snapshots: [readonly unknown[], ScheduleResponse | undefined][] }
  >({
    mutationFn: () =>
      unwrap(
        api.POST('/plans/{plan_id}/schedule-entries', {
          params: { path: { plan_id: planId } },
          body: cancellationPayload((root as ScheduleEntry).id, dateParam),
        }),
      ),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: scheduleKey });
      const snapshots = queryClient.getQueriesData<ScheduleResponse>({ queryKey: scheduleKey });
      const entryId = (rawEntry as ScheduleEntry).id;
      queryClient.setQueriesData<ScheduleResponse>({ queryKey: scheduleKey }, (old) =>
        old ? applyOptimisticCancel(old, dateParam, entryId, displayName) : old,
      );
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      Alert.alert(`Couldn't cancel ${format(date, 'EEE, MMM d')}.`, 'Try again.');
    },
    onSuccess: invalidateAndClose,
  });

  // Cancel from a substituted day: the existing replacement has to go first,
  // or the new cancellation (which only suppresses the root) never becomes
  // visible -- the replacement would keep winning. Sequential, not atomic;
  // an honest partial-failure message rather than a rollback, matching how
  // Change swap (Stage 2) behaves.
  const cancelSubstitutedMutation = useMutation<{ created: boolean }, ApiError, void>({
    mutationFn: () =>
      replaceExisting(planId, (rawEntry as ScheduleEntry).id, cancellationPayload((root as ScheduleEntry).id, dateParam)),
    onSuccess: ({ created }) => {
      invalidatePlanScheduleData(queryClient, planId);
      if (!created) {
        Alert.alert("Couldn't finish cancelling", "Removed the old swap but couldn't save the new one.");
      }
      onClose();
    },
    onError: (error) => {
      if (error.kind === 'not_found') {
        invalidateAndClose();
        return;
      }
      Alert.alert(`Couldn't cancel ${format(date, 'EEE, MMM d')}.`, 'Try again.');
    },
  });

  // Swap from a scheduled or cancelled day: a single dated create, no delete
  // first -- works from Cancelled specifically because a replacement always
  // wins over a co-existing cancellation (see resolve()'s survivor filter),
  // and leaving the cancellation in place is what lets Undo swap reveal it
  // again afterward instead of landing back on "scheduled".
  const swapMutation = useMutation<ScheduleEntry, ApiError, string>({
    mutationFn: (workoutId) =>
      unwrap(
        api.POST('/plans/{plan_id}/schedule-entries', {
          params: { path: { plan_id: planId } },
          body: replacementPayload((root as ScheduleEntry).id, dateParam, workoutId),
        }),
      ),
    onSuccess: () => {
      setPickerAction(null);
      invalidateAndClose();
    },
    onError: (error) => {
      if (error.kind === 'not_found') {
        setPickerAction(null);
        invalidateAndClose();
        return;
      }
      Alert.alert(`Couldn't swap ${format(date, 'EEE, MMM d')}.`, 'Try again.');
    },
  });

  // Change swap: the current replacement has to go first (same reasoning as
  // cancelSubstitutedMutation), then a new replacement against the root --
  // never against the swap being superseded, or the chain would deepen.
  const changeSwapMutation = useMutation<{ created: boolean }, ApiError, string>({
    mutationFn: (workoutId) =>
      replaceExisting(
        planId,
        (rawEntry as ScheduleEntry).id,
        replacementPayload((root as ScheduleEntry).id, dateParam, workoutId),
      ),
    onSuccess: ({ created }) => {
      setPickerAction(null);
      invalidatePlanScheduleData(queryClient, planId);
      if (!created) {
        Alert.alert("Couldn't finish swapping", "Removed the old swap but couldn't save the new one.");
      }
      onClose();
    },
    onError: (error) => {
      if (error.kind === 'not_found') {
        setPickerAction(null);
        invalidateAndClose();
        return;
      }
      Alert.alert(`Couldn't change the swap for ${format(date, 'EEE, MMM d')}.`, 'Try again.');
    },
  });

  const undoSwapMutation = useMutation<void, ApiError, void>({
    mutationFn: () =>
      unwrap(
        api.DELETE('/plans/{plan_id}/schedule-entries/{entry_id}', {
          params: { path: { plan_id: planId, entry_id: (rawEntry as ScheduleEntry).id } },
        }),
      ),
    onSuccess: invalidateAndClose,
    onError: (error) => {
      if (error.kind === 'not_found') {
        invalidateAndClose();
        return;
      }
      Alert.alert(`Couldn't undo the swap for ${format(date, 'EEE, MMM d')}.`, 'Try again.');
    },
  });

  function confirmUndoSwap() {
    if (!rawEntry) {
      return;
    }
    const dependents = dependentsOf(entries, rawEntry.id);
    if (dependents.length === 0) {
      undoSwapMutation.mutate();
      return;
    }
    const { title, message } = undoSwapDialogCopy(dependents, workoutsById);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo swap', onPress: () => undoSwapMutation.mutate() },
    ]);
  }

  function handlePickerSelect(workoutId: string) {
    if (pickerAction === 'swap') {
      swapMutation.mutate(workoutId);
    } else if (pickerAction === 'changeSwap') {
      changeSwapMutation.mutate(workoutId);
    }
  }

  const restoreMutation = useMutation<void, ApiError, void>({
    mutationFn: () =>
      unwrap(
        api.DELETE('/plans/{plan_id}/schedule-entries/{entry_id}', {
          params: { path: { plan_id: planId, entry_id: (rawEntry as ScheduleEntry).id } },
        }),
      ),
    onSuccess: invalidateAndClose,
    onError: (error) => {
      if (error.kind === 'not_found') {
        invalidateAndClose();
        return;
      }
      Alert.alert(`Couldn't restore ${format(date, 'EEE, MMM d')}.`, 'Try again.');
    },
  });

  function confirmRestore() {
    if (!rawEntry) {
      return;
    }
    const dependents = dependentsOf(entries, rawEntry.id);
    if (dependents.length === 0) {
      restoreMutation.mutate();
      return;
    }
    const { title, message } = restoreDialogCopy(dependents, workoutsById);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', onPress: () => restoreMutation.mutate() },
    ]);
  }

  function onActionPress(action: Action) {
    if (!rawEntry || !root) {
      return;
    }
    switch (action) {
      case 'cancel':
        if (rawEntry.id === root.id) {
          cancelMutation.mutate();
        } else {
          cancelSubstitutedMutation.mutate();
        }
        return;
      case 'restore':
        confirmRestore();
        return;
      case 'delete':
        confirmDelete();
        return;
      case 'swap':
        setPickerAction('swap');
        return;
      case 'changeSwap':
        setPickerAction('changeSwap');
        return;
      case 'undoSwap':
        confirmUndoSwap();
        return;
    }
  }

  const nonDestructiveActions = actions.filter((action) => action !== 'delete');
  const hasDelete = actions.includes('delete');

  if (pickerAction) {
    return (
      <WorkoutPickerSheet
        planId={planId}
        date={date}
        currentWorkoutId={rawEntry?.workout_id ?? null}
        onSelect={handlePickerSelect}
        onClose={() => setPickerAction(null)}
      />
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <Card style={styles.sheet}>
            <Text style={styles.title}>{workoutName}</Text>
            <Text style={styles.subtitle}>{format(date, 'EEEE, MMMM d')}</Text>

            <View style={styles.divider} />

            {entriesQuery.isLoading && !rawEntry ? (
              <ActivityIndicator color={colors.accent} style={styles.loading} />
            ) : rawEntry ? (
              <View style={styles.actionList}>
                {nonDestructiveActions.map((action) => (
                  <TouchableOpacity
                    key={action}
                    style={styles.actionRow}
                    onPress={() => onActionPress(action)}
                    accessibilityRole="button"
                    accessibilityLabel={actionLabel(action, rawEntry)}
                  >
                    <Text style={styles.actionText}>{actionLabel(action, rawEntry)}</Text>
                  </TouchableOpacity>
                ))}

                {hasDelete ? (
                  <>
                    <View style={styles.divider} />
                    <TouchableOpacity
                      style={styles.actionRow}
                      onPress={() => onActionPress('delete')}
                      accessibilityRole="button"
                      accessibilityLabel={actionLabel('delete', rawEntry)}
                    >
                      <Text style={styles.destructiveText}>{actionLabel('delete', rawEntry)}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            ) : (
              <Text style={styles.goneText}>This no longer exists.</Text>
            )}
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
  actionList: {
    gap: spacing.xs,
  },
  actionRow: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  actionText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  destructiveText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.danger,
  },
  loading: {
    paddingVertical: spacing.md,
  },
  goneText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
});
