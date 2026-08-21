import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { useActivities, type Activity, type ActivityInfo } from '@/features/logs/activities';
import { ActivityPickerSheet } from '@/features/logs/ActivityPickerSheet';
import { SelectField } from '@/features/logs/SelectField';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { createCommitment, type CommitmentRead } from './commitments';
import { DurationField } from './DurationField';
import { GoalAmountField } from './GoalAmountField';
import {
  buildGoalCreatePayload,
  canSaveGoal,
  defaultGoalForm,
  goalSummarySentence,
  resetAmountForActivity,
  type GoalForm,
} from './goalForm';
import { sessionsPerWeekLabel } from './goalTerms';
import { SessionsPickerSheet } from './SessionsPickerSheet';

export type NewGoalSheetProps = {
  onClose: () => void;
  onSaved: (commitment: CommitmentRead) => void;
};

const EMPTY_ACTIVITIES: ActivityInfo[] = [];

/** One goal per save, no editing after -- terms are frozen at creation, so this sheet only ever creates. */
export function NewGoalSheet({ onClose, onSaved }: NewGoalSheetProps) {
  const [form, setForm] = useState<GoalForm>(defaultGoalForm());
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [sessionsPickerOpen, setSessionsPickerOpen] = useState(false);

  const activitiesQuery = useActivities();
  const activities = activitiesQuery.data?.activities ?? EMPTY_ACTIVITIES;
  const unitInfos = activitiesQuery.data?.units ?? [];
  const activitiesById = new Map(activities.map((info) => [info.activity, info]));
  const selectedActivityInfo = form.activity ? (activitiesById.get(form.activity) ?? null) : null;

  const hasActivitiesData = activitiesQuery.data !== undefined;
  const activitiesLoading = activitiesQuery.isLoading && !hasActivitiesData;
  const canInteract = !activitiesLoading && !activitiesQuery.isError;

  const isDirty = form.activity !== null;

  const saveMutation = useMutation<CommitmentRead, ApiError, void>({
    mutationFn: () => createCommitment(buildGoalCreatePayload(form)),
    onSuccess: (commitment) => onSaved(commitment),
  });

  function handleDismiss() {
    if (saveMutation.isPending) {
      return;
    }
    if (isDirty) {
      Alert.alert('Discard this goal?', 'Your changes will be lost.', [
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
      amount: info ? resetAmountForActivity(prev.amount, info) : prev.amount,
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
      />
    );
  }

  if (sessionsPickerOpen) {
    return (
      <SessionsPickerSheet
        selected={form.sessionsPerWeek}
        onSelect={(sessionsPerWeek) => {
          setForm((prev) => ({ ...prev, sessionsPerWeek }));
          setSessionsPickerOpen(false);
        }}
        onClose={() => setSessionsPickerOpen(false)}
      />
    );
  }

  const activityDisplayName = form.activity ? (activitiesById.get(form.activity)?.display_name ?? form.activity) : null;
  const summary = goalSummarySentence(form);
  const isValid = canSaveGoal(form);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTouchable} onPress={handleDismiss}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <Card style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>New goal</Text>

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
                    <SelectField
                      label="Activity"
                      value={activityDisplayName}
                      placeholder="Choose an activity"
                      onPress={() => setActivityPickerOpen(true)}
                    />

                    <GoalAmountField
                      activity={selectedActivityInfo}
                      amount={form.amount}
                      unitInfos={unitInfos}
                      onChange={(amount) => setForm((prev) => ({ ...prev, amount }))}
                    />

                    <SelectField
                      label="How often"
                      value={sessionsPerWeekLabel(form.sessionsPerWeek, 'picker')}
                      placeholder="How often"
                      onPress={() => setSessionsPickerOpen(true)}
                    />

                    <DurationField
                      duration={form.duration}
                      onChange={(duration) => setForm((prev) => ({ ...prev, duration }))}
                    />

                    {summary ? (
                      <View style={styles.summaryBox}>
                        <Text style={styles.summaryText}>{summary}</Text>
                      </View>
                    ) : null}

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
                  label="Save"
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
  loadingRows: {
    gap: spacing.sm,
  },
  skeletonRow: {
    height: fontSize.md * 2,
    borderRadius: radius.md,
  },
  summaryBox: {
    paddingTop: spacing.xs,
  },
  summaryText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
