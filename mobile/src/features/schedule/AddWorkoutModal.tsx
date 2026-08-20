import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { format, getISODay, isBefore } from 'date-fns';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { api } from '@/api/client';
import { describeApiError, unwrap, type ApiError } from '@/api/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ActivityPickerSheet } from '@/features/logs/ActivityPickerSheet';
import { useActivities, type Activity, type ActivityInfo } from '@/features/logs/activities';
import { SelectField } from '@/features/logs/SelectField';
import { colors, fontSize, fontWeight, radius, spacing } from '@/theme';

import { buildEntryPayloads } from './entryPayload';
import { WEEKDAYS } from './weekdays';

type ActivePicker = 'starting' | 'ending' | null;

const EMPTY_ACTIVITIES: ActivityInfo[] = [];

// Parent conditionally mounts this component to show/hide it (rather than
// toggling a `visible` prop while mounted), so a fresh mount is guaranteed
// every time it opens -- initial state can just read `date` directly instead
// of resetting itself from an effect.
export function AddWorkoutModal({
  planId,
  date,
  onClose,
}: {
  planId: string;
  date: Date;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  // No preselected default -- blank means unset, and a guessed activity would
  // silently credit the wrong goal without the user ever seeing it happen.
  const [activity, setActivity] = useState<Activity | null>(null);
  const [activityPickerOpen, setActivityPickerOpen] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(() => new Set([getISODay(date)]));
  const [startingOn, setStartingOn] = useState(date);
  const [endingOn, setEndingOn] = useState<Date | null>(null);
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isSavingRef = useRef(false);

  const activitiesQuery = useActivities();
  const activities = activitiesQuery.data?.activities ?? EMPTY_ACTIVITIES;
  const activitiesById = useMemo(() => new Map(activities.map((info) => [info.activity, info])), [activities]);
  const activityDisplayName = activity ? (activitiesById.get(activity)?.display_name ?? activity) : null;

  const onChangeStarting = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
    if (event.type === 'set' && selected) {
      setStartingOn(selected);
    }
  }, []);

  const onChangeEnding = useCallback((event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
    if (event.type === 'set' && selected) {
      setEndingOn(selected);
    }
  }, []);

  const toggleWeekday = useCallback((iso: number) => {
    setSelectedWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) {
        next.delete(iso);
      } else {
        next.add(iso);
      }
      return next;
    });
  }, []);

  const dateError = useMemo(() => {
    if (repeat && endingOn && isBefore(endingOn, startingOn)) {
      return 'Ending on must be on or after starting on';
    }
    return null;
  }, [repeat, endingOn, startingOn]);

  const canSave = name.trim().length > 0 && !(repeat && selectedWeekdays.size === 0) && dateError === null;

  const handleDismiss = useCallback(() => {
    if (!isSavingRef.current) {
      onClose();
    }
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current || !canSave) {
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    setSubmitError(null);

    try {
      const workout = await unwrap(
        api.POST('/plans/{plan_id}/workouts', {
          params: { path: { plan_id: planId } },
          body: { name: name.trim(), notes: notes.trim() || null, activity },
        }),
      );

      const payloads = buildEntryPayloads(workout.id, {
        repeat,
        date,
        selectedWeekdays: Array.from(selectedWeekdays).sort((a, b) => a - b),
        startingOn,
        endingOn,
      });

      const results = await Promise.allSettled(
        payloads.map((body) =>
          unwrap(
            api.POST('/plans/{plan_id}/schedule-entries', {
              params: { path: { plan_id: planId } },
              body,
            }),
          ),
        ),
      );

      // Invalidate broadly -- a recurring entry can affect dates well outside
      // whatever range is currently on screen, not just the tapped day.
      queryClient.invalidateQueries({ queryKey: ['plans', planId, 'schedule'] });

      const failedCount = results.filter((result) => result.status === 'rejected').length;
      if (failedCount > 0) {
        const succeeded = payloads.length - failedCount;
        const noun = payloads.length === 1 ? 'day was' : 'days were';
        Alert.alert(
          'Partially scheduled',
          `Created "${workout.name}", but only ${succeeded} of ${payloads.length} ${noun} scheduled.`,
        );
      }

      onClose();
    } catch (err) {
      setSubmitError(describeApiError(err as ApiError));
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [canSave, planId, name, notes, activity, repeat, date, selectedWeekdays, startingOn, endingOn, queryClient, onClose]);

  if (activityPickerOpen) {
    return (
      <ActivityPickerSheet
        activities={activities}
        selected={activity}
        onSelect={(selected) => {
          setActivity(selected);
          setActivityPickerOpen(false);
        }}
        onClose={() => setActivityPickerOpen(false)}
        allowClear
        onClear={() => {
          setActivity(null);
          setActivityPickerOpen(false);
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTouchable} onPress={handleDismiss}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <Card style={styles.sheet}>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
                <Text style={styles.title}>Add workout</Text>
                <Text style={styles.subtitle}>{format(date, 'EEEE, MMMM d')}</Text>

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

                <SelectField
                  label="Activity"
                  value={activityDisplayName}
                  placeholder="None"
                  onPress={() => setActivityPickerOpen(true)}
                />

                <View style={styles.switchRow}>
                  <Text style={styles.label}>Repeat?</Text>
                  <Switch
                    value={repeat}
                    onValueChange={setRepeat}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={colors.background}
                  />
                </View>

                <View style={styles.weekdayRow}>
                  {WEEKDAYS.map(({ iso, label }) => {
                    const selected = selectedWeekdays.has(iso);
                    return (
                      <TouchableOpacity
                        key={iso}
                        disabled={!repeat}
                        onPress={() => toggleWeekday(iso)}
                        style={[
                          styles.weekdayCircle,
                          selected && styles.weekdayCircleSelected,
                          !repeat && styles.weekdayCircleDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !repeat, selected }}
                      >
                        <Text style={[styles.weekdayLabel, selected && styles.weekdayLabelSelected]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, !repeat && styles.labelDisabled]}>starting on</Text>
                  <TouchableOpacity
                    disabled={!repeat}
                    onPress={() => setActivePicker('starting')}
                    style={[styles.dateField, !repeat && styles.dateFieldDisabled]}
                  >
                    <Text style={[styles.dateFieldText, !repeat && styles.dateFieldTextDisabled]}>
                      {format(startingOn, 'yyyy-MM-dd')}
                    </Text>
                  </TouchableOpacity>
                  {activePicker === 'starting' ? (
                    <View style={styles.pickerWrap}>
                      <DateTimePicker
                        value={startingOn}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        onChange={onChangeStarting}
                      />
                      {Platform.OS === 'ios' ? (
                        <Button label="Done" variant="secondary" onPress={() => setActivePicker(null)} />
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, !repeat && styles.labelDisabled]}>ending on</Text>
                  <View style={styles.dateFieldRow}>
                    <TouchableOpacity
                      disabled={!repeat}
                      onPress={() => setActivePicker('ending')}
                      style={[styles.dateField, styles.dateFieldFlex, !repeat && styles.dateFieldDisabled]}
                    >
                      <Text
                        style={[
                          styles.dateFieldText,
                          !endingOn && styles.dateFieldPlaceholder,
                          !repeat && styles.dateFieldTextDisabled,
                        ]}
                      >
                        {endingOn ? format(endingOn, 'yyyy-MM-dd') : 'never'}
                      </Text>
                    </TouchableOpacity>
                    {repeat && endingOn ? (
                      <TouchableOpacity onPress={() => setEndingOn(null)} accessibilityRole="button">
                        <Text style={styles.clearText}>Clear</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {activePicker === 'ending' ? (
                    <View style={styles.pickerWrap}>
                      <DateTimePicker
                        value={endingOn ?? startingOn}
                        mode="date"
                        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                        minimumDate={startingOn}
                        onChange={onChangeEnding}
                      />
                      {Platform.OS === 'ios' ? (
                        <Button label="Done" variant="secondary" onPress={() => setActivePicker(null)} />
                      ) : null}
                    </View>
                  ) : null}
                </View>

                {dateError ? <Text style={styles.errorText}>{dateError}</Text> : null}
                {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
              </ScrollView>

              <View style={styles.footer}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={handleDismiss}
                  disabled={isSaving}
                  style={styles.footerButton}
                />
                <Button
                  label="Save"
                  variant="primary"
                  onPress={handleSave}
                  disabled={!canSave}
                  loading={isSaving}
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
  labelDisabled: {
    color: colors.textMuted,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  weekdayCircleDisabled: {
    opacity: 0.5,
  },
  weekdayLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  weekdayLabelSelected: {
    color: colors.background,
  },
  dateFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateField: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateFieldFlex: {
    flex: 1,
  },
  dateFieldDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  clearText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  pickerWrap: {
    gap: spacing.xs,
  },
  dateFieldText: {
    fontSize: fontSize.md,
    color: colors.text,
  },
  dateFieldTextDisabled: {
    color: colors.textMuted,
  },
  dateFieldPlaceholder: {
    color: colors.textMuted,
    fontStyle: 'italic',
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
