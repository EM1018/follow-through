import { format, isBefore } from 'date-fns';

import type { ScheduleEntry, ScheduleEntryPatch } from './blastRadius';

/**
 * Only the fields that changed, and only the ones a recurring entry can ever
 * take -- day_of_week/starts_on/ends_on, never on_date (the kind-lock rejects
 * that as a kind swap).
 */
export function recurringSchedulePatch(
  entry: ScheduleEntry,
  dayOfWeek: number,
  startsOn: string | null,
  endsOn: string | null,
): ScheduleEntryPatch {
  const patch: ScheduleEntryPatch = {};
  if (dayOfWeek !== entry.day_of_week) {
    patch.day_of_week = dayOfWeek;
  }
  if (startsOn !== entry.starts_on) {
    patch.starts_on = startsOn;
  }
  if (endsOn !== entry.ends_on) {
    patch.ends_on = endsOn;
  }
  return patch;
}

/** Only on_date, never day_of_week/starts_on/ends_on -- the dated counterpart of recurringSchedulePatch. */
export function datedSchedulePatch(entry: ScheduleEntry, onDate: string): ScheduleEntryPatch {
  return onDate !== entry.on_date ? { on_date: onDate } : {};
}

/** ends_on set to today -- the history-preserving counterpart to deleting a recurrence. */
export function stopRepeatingPatch(today: Date): ScheduleEntryPatch {
  return { ends_on: format(today, 'yyyy-MM-dd') };
}

/**
 * Change workout's two request shapes (the PATCH invariants' trap): picking
 * an existing workout must null out any prior name_override in the same
 * request, or the old override stays set and the API 422s.
 */
export function changeToExistingWorkoutPatch(workoutId: string): ScheduleEntryPatch {
  return { workout_id: workoutId, name_override: null };
}

/** The name-only counterpart -- no workout row is ever created for this path (see WorkoutSelection). */
export function changeToNewNamePatch(name: string): ScheduleEntryPatch {
  return { name_override: name, workout_id: null };
}

/**
 * Inline validation for the recurring edit sheet: ending-on may not precede
 * starting-on. Both are nullable here (blank means never/always), unlike
 * AddWorkoutModal's create flow where starting-on is required -- no error
 * unless both are actually set.
 */
export function dateRangeError(startingOn: Date | null, endingOn: Date | null): string | null {
  if (startingOn && endingOn && isBefore(endingOn, startingOn)) {
    return 'Ending on must be on or after starting on';
  }
  return null;
}

/**
 * PATCH first, then delete each stranded row -- sequential, not atomic, same
 * as prompt 12's replaceExisting. `deleteEntry`/`patchEntry` are injected so
 * this stays testable without mocking the API client: a failure to patch
 * means no deletes were ever attempted, and a partial delete failure is
 * reported through `failedCount` rather than rolled back.
 */
export async function patchThenClearStranded(
  patchEntry: () => Promise<void>,
  strandedIds: string[],
  deleteEntry: (id: string) => Promise<void>,
): Promise<{ failedCount: number }> {
  await patchEntry();
  const results = await Promise.allSettled(strandedIds.map(deleteEntry));
  return { failedCount: results.filter((result) => result.status === 'rejected').length };
}
