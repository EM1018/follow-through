import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { invalidatePlanScheduleData, useScheduleEntries, useWorkouts, type ResolvedEntry, type WorkoutRead } from './api';
import { entryDeleteDialogCopy } from './deleteCopy';

const EMPTY_ENTRIES: never[] = [];
const EMPTY_WORKOUTS: WorkoutRead[] = [];

// Parent conditionally mounts this component (see AddWorkoutModal's note),
// so a fresh mount every open is guaranteed.
export function EntryActionsSheet({
  planId,
  date,
  entry,
  onClose,
}: {
  planId: string;
  date: Date;
  entry: ResolvedEntry;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const entriesQuery = useScheduleEntries(planId);
  const workoutsQuery = useWorkouts(planId);

  const entries = entriesQuery.data ?? EMPTY_ENTRIES;
  const workouts = workoutsQuery.data ?? EMPTY_WORKOUTS;
  const workoutsById = useMemo(() => Object.fromEntries(workouts.map((w) => [w.id, w])), [workouts]);
  const rawEntry = entries.find((e) => e.id === entry.entry_id);

  const workoutName = entry.name ?? 'this workout';

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
              <TouchableOpacity
                style={styles.actionRow}
                onPress={confirmDelete}
                accessibilityRole="button"
                accessibilityLabel="Remove from schedule"
              >
                <Text style={styles.actionText}>Remove from schedule</Text>
              </TouchableOpacity>
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
  actionRow: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  actionText: {
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
