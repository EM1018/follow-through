import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { invalidatePlanScheduleData, type WorkoutRead } from './api';
import { buildWorkoutPatch, canSaveWorkout } from './workoutEdit';

// Parent conditionally mounts this component (see AddWorkoutModal's note), so
// a fresh mount every open is guaranteed -- initial state can read `workout`
// directly instead of resetting itself from an effect.
export function WorkoutEditSheet({
  planId,
  workout,
  onClose,
}: {
  planId: string;
  workout: WorkoutRead;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(workout.name);
  const [notes, setNotes] = useState(workout.notes ?? '');

  const canSave = canSaveWorkout(workout, name, notes);

  const saveMutation = useMutation<WorkoutRead, ApiError, void>({
    mutationFn: () =>
      unwrap(
        api.PATCH('/plans/{plan_id}/workouts/{workout_id}', {
          params: { path: { plan_id: planId, workout_id: workout.id } },
          body: buildWorkoutPatch(workout, name, notes),
        }),
      ),
    onSuccess: () => {
      invalidatePlanScheduleData(queryClient, planId);
      onClose();
    },
  });

  const handleDismiss = useCallback(() => {
    if (!saveMutation.isPending) {
      onClose();
    }
  }, [onClose, saveMutation.isPending]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTouchable} onPress={handleDismiss}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <Card style={styles.sheet}>
              <Text style={styles.title}>Edit workout</Text>

              <View style={styles.field}>
                <Text style={styles.label}>Workout name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Push day"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
              </View>

              {saveMutation.isError ? <Text style={styles.errorText}>{"Couldn't save changes."}</Text> : null}

              <View style={styles.footer}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={handleDismiss}
                  disabled={saveMutation.isPending}
                  style={styles.footerButton}
                />
                <Button
                  label="Save"
                  variant="primary"
                  onPress={() => saveMutation.mutate()}
                  disabled={!canSave}
                  loading={saveMutation.isPending}
                  style={styles.footerButton}
                />
              </View>
            </Card>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  backdropTouchable: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
  },
  notesInput: {
    minHeight: spacing.xl * 2,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
