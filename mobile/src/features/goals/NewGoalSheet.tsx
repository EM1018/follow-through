import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
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
import { useMe } from '@/features/profile/me';
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
  isChallengeForm,
  resetAmountForActivity,
  withSendTo,
  type GoalForm,
} from './goalForm';
import { sessionsPerWeekLabel } from './goalTerms';
import { checkSendTo, sendToProblemFromError, type SendToProblem } from './sendTo';
import { SendToField } from './SendToField';
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
  // What blur (or Save) found wrong with "Send to" -- cleared on the next keystroke.
  const [sendToCheck, setSendToCheck] = useState<SendToProblem | null>(null);

  // undefined until /me lands: the checks that need it wait for the server instead.
  const meQuery = useMe();
  const myUsername = meQuery.data === undefined ? undefined : meQuery.data.username;

  const activitiesQuery = useActivities();
  const activities = activitiesQuery.data?.activities ?? EMPTY_ACTIVITIES;
  const unitInfos = activitiesQuery.data?.units ?? [];
  const activitiesById = new Map(activities.map((info) => [info.activity, info]));
  const selectedActivityInfo = form.activity ? (activitiesById.get(form.activity) ?? null) : null;

  const hasActivitiesData = activitiesQuery.data !== undefined;
  const activitiesLoading = activitiesQuery.isLoading && !hasActivitiesData;
  const canInteract = !activitiesLoading && !activitiesQuery.isError;

  const isChallenge = isChallengeForm(form);
  const isDirty = form.activity !== null || isChallenge;

  const saveMutation = useMutation<CommitmentRead, ApiError, void>({
    mutationFn: () => createCommitment(buildGoalCreatePayload(form)),
    onSuccess: (commitment) => onSaved(commitment),
  });

  // A failed send that's about the recipient belongs on the field, not in the general error box.
  const serverSendToProblem = saveMutation.isError ? sendToProblemFromError(saveMutation.error) : null;
  const sendToProblem = serverSendToProblem ?? sendToCheck;

  function handleSendToChange(sendTo: string) {
    setForm((prev) => withSendTo(prev, sendTo));
    setSendToCheck(null);
    // The last server answer described the old name, not this one.
    if (saveMutation.isError) {
      saveMutation.reset();
    }
  }

  function handleSave() {
    // Same check as blur -- tapping Save doesn't reliably blur the field first.
    const problem = checkSendTo(form.sendTo, myUsername);
    if (problem) {
      setSendToCheck(problem);
      return;
    }
    saveMutation.mutate();
  }

  function handleGoToProfile() {
    // The sheet is a modal over the Goals tab; it has to go before Profile can show.
    onClose();
    router.push('/(app)/(tabs)/profile');
  }

  function handleDismiss() {
    if (saveMutation.isPending) {
      return;
    }
    if (isDirty) {
      Alert.alert(isChallenge ? 'Discard this challenge?' : 'Discard this goal?', 'Your changes will be lost.', [
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
                <Text style={styles.title}>{isChallenge ? 'New challenge' : 'New goal'}</Text>

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
                      ongoingDisabled={isChallenge}
                    />

                    <SendToField
                      value={form.sendTo}
                      onChange={handleSendToChange}
                      onBlur={() => setSendToCheck(checkSendTo(form.sendTo, myUsername))}
                      problem={sendToProblem}
                      onGoToProfile={handleGoToProfile}
                    />

                    {summary ? (
                      <View style={styles.summaryBox}>
                        <Text style={styles.summaryText}>{summary}</Text>
                      </View>
                    ) : null}

                    {saveMutation.isError && serverSendToProblem === null ? (
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
                  onPress={handleSave}
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
