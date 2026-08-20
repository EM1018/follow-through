import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { ActivityPickerSheet } from '@/features/logs/ActivityPickerSheet';
import { useActivities, type Activity, type ActivityInfo, type UnitInfo } from '@/features/logs/activities';
import { AmountField } from '@/features/logs/AmountField';
import {
  buildPatch,
  canSaveEdit,
  formsEqual,
  groupUnitsByDimension,
  resetUnitForActivity,
  type CompletionForm,
} from '@/features/logs/completionForm';
import { invalidateCompletionsQueries, updateCompletion, type CompletionRead } from '@/features/logs/completions';
import { fieldStyles } from '@/features/logs/fieldStyles';
import { NoteField } from '@/features/logs/NoteField';
import { SelectField } from '@/features/logs/SelectField';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { ScheduleErrorState } from './ScheduleErrorState';

const EMPTY_ACTIVITIES: ActivityInfo[] = [];
const EMPTY_UNIT_INFOS: UnitInfo[] = [];

function formFor(completion: CompletionRead): CompletionForm {
  return {
    activity: completion.activity,
    value: completion.value !== null ? String(completion.value) : '',
    unit: completion.unit,
    // Never surfaced or edited here -- the date is fixed by the schedule row
    // this completion belongs to. Kept only because CompletionForm carries it
    // and buildPatch/canSaveEdit never look at it, so reusing them stays safe.
    onDate: completion.on_date,
    note: completion.note ?? '',
  };
}

/**
 * The schedule's tap-then-add editor (Prompt 23): Amount, Activity (for this
 * log only -- distinct from the workout's own activity, which only affects
 * future ticks), and Note. No Date row. Reuses the Log tab's own row
 * components and form helpers rather than rebuilding them.
 */
export function CompletionEditSheet({
  planId,
  completion,
  entryName,
  onClose,
}: {
  planId: string;
  completion: CompletionRead;
  entryName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [initialForm] = useState<CompletionForm>(() => formFor(completion));
  const [form, setForm] = useState<CompletionForm>(initialForm);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);

  const activitiesQuery = useActivities();
  const activities = activitiesQuery.data?.activities ?? EMPTY_ACTIVITIES;
  const unitInfos = activitiesQuery.data?.units ?? EMPTY_UNIT_INFOS;
  const activitiesById = useMemo(() => new Map(activities.map((info) => [info.activity, info])), [activities]);
  const selectedActivityInfo = form.activity ? (activitiesById.get(form.activity) ?? null) : null;
  const activityDisplayName = form.activity ? (activitiesById.get(form.activity)?.display_name ?? form.activity) : null;

  const hasActivitiesData = activitiesQuery.data !== undefined;
  const activitiesLoading = activitiesQuery.isLoading && !hasActivitiesData;
  const canInteract = !activitiesLoading && !activitiesQuery.isError;
  const isDirty = !formsEqual(form, initialForm);
  const isValid = canSaveEdit(completion, form);

  const saveMutation = useMutation<CompletionRead, ApiError, void>({
    mutationFn: () => updateCompletion(completion.id, buildPatch(completion, form)),
    onSuccess: () => {
      // Both the Log tab's list/graph and this same schedule row read from
      // completions data -- a patch made here has to reach both.
      invalidateCompletionsQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['plans', planId, 'schedule'] });
      onClose();
    },
  });

  function handleDismiss() {
    if (saveMutation.isPending) {
      return;
    }
    if (isDirty) {
      Alert.alert('Discard these changes?', 'Your changes will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  }

  function handleSelectActivity(activity: Activity) {
    const info = activitiesById.get(activity);
    setForm((prev) => ({
      ...prev,
      activity,
      unit: info ? resetUnitForActivity(prev.unit, info) : prev.unit,
    }));
    setActivityPickerOpen(false);
  }

  if (activityPickerOpen) {
    return (
      <ActivityPickerSheet
        activities={activities}
        selected={form.activity}
        onSelect={handleSelectActivity}
        onClose={() => setActivityPickerOpen(false)}
        allowClear
        onClear={() => {
          setForm((prev) => ({ ...prev, activity: null }));
          setActivityPickerOpen(false);
        }}
      />
    );
  }

  const unitGroups = groupUnitsByDimension(
    selectedActivityInfo ? selectedActivityInfo.units : unitInfos.map((info) => info.unit),
    unitInfos,
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTouchable} onPress={handleDismiss}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <Card style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Edit log</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {entryName}
                </Text>

                {activitiesLoading ? (
                  <View style={styles.loadingRows}>
                    <Skeleton style={styles.skeletonRow} />
                    <Skeleton style={styles.skeletonRow} />
                    <Skeleton style={styles.skeletonRow} />
                  </View>
                ) : null}

                {activitiesQuery.isError ? (
                  <ScheduleErrorState error={activitiesQuery.error} onRetry={() => activitiesQuery.refetch()} />
                ) : null}

                {canInteract ? (
                  <>
                    <AmountField
                      value={form.value}
                      unit={form.unit}
                      unitGroups={unitGroups}
                      onChangeValue={(text) => setForm((prev) => ({ ...prev, value: text }))}
                      onChangeUnit={(unit) => setForm((prev) => ({ ...prev, unit }))}
                    />

                    <View style={fieldStyles.field}>
                      <SelectField
                        label="Activity for this log"
                        value={activityDisplayName}
                        placeholder="None"
                        onPress={() => setActivityPickerOpen(true)}
                      />
                      <Text style={styles.hint}>
                        Only this log -- the workout&rsquo;s own activity, which future ticks pick up, is unchanged.
                      </Text>
                    </View>

                    <NoteField value={form.note} onChangeText={(text) => setForm((prev) => ({ ...prev, note: text }))} />

                    {saveMutation.isError ? (
                      <ScheduleErrorState error={saveMutation.error} onRetry={() => saveMutation.mutate()} />
                    ) : null}
                  </>
                ) : null}
              </ScrollView>

              <View style={styles.footer}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={handleDismiss}
                  disabled={saveMutation.isPending}
                  style={styles.footerButton}
                />
                <Button
                  label="Save changes"
                  variant="primary"
                  onPress={() => saveMutation.mutate()}
                  disabled={!canInteract || !isValid}
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
    maxHeight: '85%',
  },
  sheet: {
    gap: spacing.md,
  },
  scrollContent: {
    gap: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  loadingRows: {
    gap: spacing.sm,
  },
  skeletonRow: {
    height: fontSize.md * 2,
    borderRadius: radius.md,
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
