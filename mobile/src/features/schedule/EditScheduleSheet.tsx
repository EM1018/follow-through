import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
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
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { parseDateOnly } from '@/lib/dates';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { invalidatePlanScheduleData, useScheduleEntries, useWorkouts, type ScheduleEntryRead, type WorkoutRead } from './api';
import { strandedBy, type ScheduleEntry } from './blastRadius';
import {
  dateRangeError,
  datedSchedulePatch,
  patchThenClearStranded,
  recurringSchedulePatch,
} from './scheduleEdit';
import { moveConfirmCopy, moveFailureMessage } from './scheduleEditCopy';
import { WEEKDAYS } from './weekdays';

type ActivePicker = 'starting' | 'ending' | 'date' | null;

const EMPTY_ENTRIES: ScheduleEntryRead[] = [];
const EMPTY_WORKOUTS: WorkoutRead[] = [];

// Parent conditionally mounts this component (see AddWorkoutModal's note), so
// a fresh mount every open is guaranteed.
export function EditScheduleSheet({
  planId,
  entry,
  workoutName,
  planStartsOn,
  planEndsOn,
  onClose,
  onSaved,
}: {
  planId: string;
  entry: ScheduleEntry;
  workoutName: string;
  planStartsOn: Date;
  planEndsOn: Date | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const isRecurring = entry.day_of_week !== null;

  const entriesQuery = useScheduleEntries(planId);
  const workoutsQuery = useWorkouts(planId);
  const entries = entriesQuery.data ?? EMPTY_ENTRIES;
  const workouts = workoutsQuery.data ?? EMPTY_WORKOUTS;
  const workoutsById = useMemo(() => Object.fromEntries(workouts.map((w) => [w.id, w])), [workouts]);

  const [selectedWeekday, setSelectedWeekday] = useState(entry.day_of_week ?? 1);
  const [startingOn, setStartingOn] = useState<Date | null>(entry.starts_on ? parseDateOnly(entry.starts_on) : null);
  const [endingOn, setEndingOn] = useState<Date | null>(entry.ends_on ? parseDateOnly(entry.ends_on) : null);
  const [selectedDate, setSelectedDate] = useState<Date>(entry.on_date ? parseDateOnly(entry.on_date) : new Date());
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  const patch = isRecurring
    ? recurringSchedulePatch(
        entry,
        selectedWeekday,
        startingOn ? format(startingOn, 'yyyy-MM-dd') : null,
        endingOn ? format(endingOn, 'yyyy-MM-dd') : null,
      )
    : datedSchedulePatch(entry, format(selectedDate, 'yyyy-MM-dd'));

  const dirty = Object.keys(patch).length > 0;
  const rangeError = isRecurring ? dateRangeError(startingOn, endingOn) : null;
  const canSave = dirty && rangeError === null;

  const saveMutation = useMutation<{ failedCount: number }, ApiError, string[]>({
    mutationFn: (strandedIds) =>
      patchThenClearStranded(
        () =>
          unwrap(
            api.PATCH('/plans/{plan_id}/schedule-entries/{entry_id}', {
              params: { path: { plan_id: planId, entry_id: entry.id } },
              body: patch,
            }),
          ).then(() => undefined),
        strandedIds,
        (entryId) =>
          unwrap(
            api.DELETE('/plans/{plan_id}/schedule-entries/{entry_id}', {
              params: { path: { plan_id: planId, entry_id: entryId } },
            }),
          ),
      ),
    onSuccess: ({ failedCount }) => {
      invalidatePlanScheduleData(queryClient, planId);
      if (failedCount > 0) {
        Alert.alert("Couldn't clear everything", moveFailureMessage(patch, failedCount));
      }
      onSaved();
    },
    onError: (error) => {
      if (error.kind === 'not_found') {
        invalidatePlanScheduleData(queryClient, planId);
        onSaved();
        return;
      }
      Alert.alert("Couldn't save changes.", 'Try again.');
    },
  });

  function handleSave() {
    const stranded = strandedBy(entries, entry, patch);
    const strandedRows = [...stranded.replacements, ...stranded.cancellations];

    if (strandedRows.length === 0) {
      saveMutation.mutate([]);
      return;
    }

    const { title, message } = moveConfirmCopy(workoutName, entry, patch, stranded, workoutsById);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move and clear them', onPress: () => saveMutation.mutate(strandedRows.map((row) => row.id)) },
      { text: 'Move and keep them', onPress: () => saveMutation.mutate([]) },
    ]);
  }

  function onChangeStarting(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
    if (event.type === 'set' && selected) {
      setStartingOn(selected);
    }
  }

  function onChangeEnding(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
    if (event.type === 'set' && selected) {
      setEndingOn(selected);
    }
  }

  function onChangeDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
    if (event.type === 'set' && selected) {
      setSelectedDate(selected);
    }
  }

  const maximumDate = planEndsOn ?? undefined;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTouchable} onPress={onClose}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <Card style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>{isRecurring ? 'Edit schedule' : 'Edit date'}</Text>
                <Text style={styles.subtitle}>{workoutName}</Text>

                {isRecurring ? (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Repeats on</Text>
                      <View style={styles.weekdayRow}>
                        {WEEKDAYS.map(({ iso, label }) => {
                          const selected = selectedWeekday === iso;
                          return (
                            <TouchableOpacity
                              key={iso}
                              onPress={() => setSelectedWeekday(iso)}
                              style={[styles.weekdayCircle, selected && styles.weekdayCircleSelected]}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                            >
                              <Text style={[styles.weekdayLabel, selected && styles.weekdayLabelSelected]}>
                                {label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>starting on</Text>
                      <TouchableOpacity onPress={() => setActivePicker('starting')} style={styles.dateField}>
                        <Text style={[styles.dateFieldText, !startingOn && styles.dateFieldPlaceholder]}>
                          {startingOn ? format(startingOn, 'yyyy-MM-dd') : 'never'}
                        </Text>
                      </TouchableOpacity>
                      {startingOn ? (
                        <TouchableOpacity onPress={() => setStartingOn(null)} accessibilityRole="button">
                          <Text style={styles.clearText}>Clear</Text>
                        </TouchableOpacity>
                      ) : null}
                      {activePicker === 'starting' ? (
                        <View style={styles.pickerWrap}>
                          <DateTimePicker
                            value={startingOn ?? planStartsOn}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={planStartsOn}
                            maximumDate={maximumDate}
                            onChange={onChangeStarting}
                          />
                          {Platform.OS === 'ios' ? (
                            <Button label="Done" variant="secondary" onPress={() => setActivePicker(null)} />
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>ending on</Text>
                      <TouchableOpacity onPress={() => setActivePicker('ending')} style={styles.dateField}>
                        <Text style={[styles.dateFieldText, !endingOn && styles.dateFieldPlaceholder]}>
                          {endingOn ? format(endingOn, 'yyyy-MM-dd') : 'never'}
                        </Text>
                      </TouchableOpacity>
                      {endingOn ? (
                        <TouchableOpacity onPress={() => setEndingOn(null)} accessibilityRole="button">
                          <Text style={styles.clearText}>Clear</Text>
                        </TouchableOpacity>
                      ) : null}
                      {activePicker === 'ending' ? (
                        <View style={styles.pickerWrap}>
                          <DateTimePicker
                            value={endingOn ?? startingOn ?? planStartsOn}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={planStartsOn}
                            maximumDate={maximumDate}
                            onChange={onChangeEnding}
                          />
                          {Platform.OS === 'ios' ? (
                            <Button label="Done" variant="secondary" onPress={() => setActivePicker(null)} />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <View style={styles.field}>
                    <Text style={styles.label}>date</Text>
                    <TouchableOpacity onPress={() => setActivePicker('date')} style={styles.dateField}>
                      <Text style={styles.dateFieldText}>{format(selectedDate, 'yyyy-MM-dd')}</Text>
                    </TouchableOpacity>
                    {activePicker === 'date' ? (
                      <View style={styles.pickerWrap}>
                        <DateTimePicker
                          value={selectedDate}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          minimumDate={planStartsOn}
                          maximumDate={maximumDate}
                          onChange={onChangeDate}
                        />
                        {Platform.OS === 'ios' ? (
                          <Button label="Done" variant="secondary" onPress={() => setActivePicker(null)} />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                )}

                {rangeError ? <Text style={styles.errorText}>{rangeError}</Text> : null}
                {saveMutation.isError ? <Text style={styles.errorText}>{"Couldn't save changes."}</Text> : null}
              </ScrollView>

              <View style={styles.footer}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={onClose}
                  disabled={saveMutation.isPending}
                  style={styles.footerButton}
                />
                <Button
                  label="Save"
                  variant="primary"
                  onPress={handleSave}
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
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekdayCircle: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayCircleSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  weekdayLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  weekdayLabelSelected: {
    color: colors.background,
  },
  dateField: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateFieldText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  dateFieldPlaceholder: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  clearText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  pickerWrap: {
    gap: spacing.xs,
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
