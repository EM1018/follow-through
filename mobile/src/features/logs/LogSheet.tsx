import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation } from '@tanstack/react-query';
import { startOfToday } from 'date-fns';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Skeleton } from '@/components/Skeleton';
import { ScheduleErrorState } from '@/features/schedule/ScheduleErrorState';
import { formatDateOnly, parseDateOnly } from '@/lib/dates';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { useActivities, type Activity, type ActivityInfo, type UnitInfo } from './activities';
import { ActivityPickerSheet } from './ActivityPickerSheet';
import {
  buildCreatePayload,
  buildPatch,
  canSave,
  canSaveEdit,
  groupUnitsByDimension,
  resetUnitForActivity,
  type CompletionForm,
} from './completionForm';
import { createCompletion, updateCompletion, type CompletionRead } from './completions';
import { sectionLabel } from './sections';
import { UnitChips } from './UnitChips';

export type LogSheetProps =
  | { mode: 'create'; onClose: () => void; onSaved: (completion: CompletionRead) => void }
  | { mode: 'edit'; completion: CompletionRead; onClose: () => void; onSaved: (completion: CompletionRead) => void };

const EMPTY_ACTIVITIES: ActivityInfo[] = [];
const EMPTY_UNIT_INFOS: UnitInfo[] = [];

function initialFormFor(props: LogSheetProps, today: Date): CompletionForm {
  if (props.mode === 'edit') {
    const { completion } = props;
    return {
      activity: completion.activity,
      value: completion.value !== null ? String(completion.value) : '',
      unit: completion.unit,
      onDate: completion.on_date,
      note: completion.note ?? '',
    };
  }
  return { activity: null, value: '', unit: null, onDate: formatDateOnly(today), note: '' };
}

function formsEqual(a: CompletionForm, b: CompletionForm): boolean {
  return (
    a.activity === b.activity && a.value === b.value && a.unit === b.unit && a.onDate === b.onDate && a.note === b.note
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.selectField, styles.readOnlyField]}>
        <Text style={styles.readOnlyText}>{value}</Text>
      </View>
    </View>
  );
}

/** One sheet, one `mode` -- create and edit share every row; edit only locks Activity and Date. */
export function LogSheet(props: LogSheetProps) {
  const { mode, onClose, onSaved } = props;
  const today = useMemo(() => startOfToday(), []);
  const seedForm = initialFormFor(props, today);
  const [initialForm] = useState<CompletionForm>(seedForm);
  const [form, setForm] = useState<CompletionForm>(seedForm);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const activitiesQuery = useActivities();
  const activities = activitiesQuery.data?.activities ?? EMPTY_ACTIVITIES;
  const unitInfos = activitiesQuery.data?.units ?? EMPTY_UNIT_INFOS;
  const activitiesById = useMemo(() => new Map(activities.map((info) => [info.activity, info])), [activities]);
  const selectedActivityInfo = form.activity ? (activitiesById.get(form.activity) ?? null) : null;

  const hasActivitiesData = activitiesQuery.data !== undefined;
  const activitiesLoading = activitiesQuery.isLoading && !hasActivitiesData;

  const isDirty = !formsEqual(form, initialForm);

  const saveMutation = useMutation<CompletionRead, ApiError, void>({
    mutationFn: () =>
      mode === 'create'
        ? createCompletion(buildCreatePayload(form))
        : updateCompletion(props.completion.id, buildPatch(props.completion, form)),
    onSuccess: (completion) => onSaved(completion),
  });

  function handleDismiss() {
    if (saveMutation.isPending) {
      return;
    }
    if (isDirty) {
      Alert.alert('Discard this log?', 'Your changes will be lost.', [
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

  function handleChangeDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setDatePickerOpen(false);
    }
    if (event.type === 'set' && selected) {
      setForm((prev) => ({ ...prev, onDate: formatDateOnly(selected) }));
    }
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

  const isValid = mode === 'create' ? canSave(form) : canSaveEdit(props.completion, form);
  const showUnitChips = form.value.trim() !== '';
  const unitGroups = selectedActivityInfo ? groupUnitsByDimension(selectedActivityInfo.units, unitInfos) : [];
  const activityDisplayName = form.activity ? (activitiesById.get(form.activity)?.display_name ?? form.activity) : null;

  const title = mode === 'create' ? 'Log activity' : 'Edit log';
  const primaryLabel = mode === 'create' ? 'Log activity' : 'Save changes';
  const canInteract = !activitiesLoading && !activitiesQuery.isError;

  const amountField = (
    <View style={styles.field}>
      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.input}
        value={form.value}
        onChangeText={(text) => setForm((prev) => ({ ...prev, value: text }))}
        placeholder="Leave blank to log without an amount"
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
      />
      {showUnitChips ? (
        <UnitChips groups={unitGroups} selected={form.unit} onSelect={(unit) => setForm((prev) => ({ ...prev, unit }))} />
      ) : null}
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTouchable} onPress={handleDismiss}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <Card style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>{title}</Text>

                {activitiesLoading ? (
                  <View style={styles.loadingRows}>
                    <Skeleton style={styles.skeletonRow} />
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
                    {mode === 'edit' ? (
                      <>
                        <ReadOnlyField label="Activity" value={activityDisplayName ?? 'No activity'} />
                        <ReadOnlyField label="Date" value={sectionLabel(form.onDate, today)} />
                        <Text style={styles.lockedHint}>To change these, delete this log and add it again.</Text>
                        {amountField}
                      </>
                    ) : (
                      <>
                        <View style={styles.field}>
                          <Text style={styles.label}>Activity</Text>
                          <TouchableOpacity
                            style={styles.selectField}
                            onPress={() => setActivityPickerOpen(true)}
                            accessibilityRole="button"
                          >
                            <Text style={[styles.selectFieldText, !activityDisplayName && styles.placeholderText]}>
                              {activityDisplayName ?? 'Choose an activity'}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {amountField}

                        <View style={styles.field}>
                          <Text style={styles.label}>Date</Text>
                          <TouchableOpacity
                            style={styles.selectField}
                            onPress={() => setDatePickerOpen(true)}
                            accessibilityRole="button"
                          >
                            <Text style={styles.selectFieldText}>{sectionLabel(form.onDate, today)}</Text>
                          </TouchableOpacity>
                          {datePickerOpen ? (
                            <View style={styles.pickerWrap}>
                              <DateTimePicker
                                value={parseDateOnly(form.onDate)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                maximumDate={today}
                                onChange={handleChangeDate}
                              />
                              {Platform.OS === 'ios' ? (
                                <Button label="Done" variant="secondary" onPress={() => setDatePickerOpen(false)} />
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      </>
                    )}

                    <View style={styles.field}>
                      <Text style={styles.label}>Note</Text>
                      <TextInput
                        style={[styles.input, styles.noteInput]}
                        value={form.note}
                        onChangeText={(text) => setForm((prev) => ({ ...prev, note: text }))}
                        placeholder="Optional"
                        placeholderTextColor={colors.textMuted}
                        multiline
                      />
                    </View>

                    {/* Reserved for what this satisfies once the dry-run endpoint exists -- not computed on the client. */}
                    <View style={styles.footerSlot} />

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
                  label={primaryLabel}
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
  noteInput: {
    minHeight: spacing.xl * 2,
    textAlignVertical: 'top',
  },
  selectField: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectFieldText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  placeholderText: {
    color: colors.textMuted,
  },
  readOnlyField: {
    backgroundColor: colors.surfaceMuted,
  },
  readOnlyText: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  lockedHint: {
    marginTop: -spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  pickerWrap: {
    gap: spacing.xs,
  },
  footerSlot: {
    minHeight: fontSize.sm,
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
