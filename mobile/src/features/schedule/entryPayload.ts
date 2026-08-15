import { format } from 'date-fns';

import type { components } from '@/api/schema';

export type ScheduleEntryCreate = components['schemas']['ScheduleEntryCreate'];

export type WorkoutFormState = {
  repeat: boolean;
  date: Date;
  selectedWeekdays: number[];
  startingOn: Date;
  endingOn: Date | null;
};

/**
 * One entry payload per selected weekday when repeating, or a single
 * one-off payload for the tapped date otherwise. Exactly one of
 * day_of_week/on_date is ever set, matching the backend's hard constraint --
 * never both, never neither.
 */
export function buildEntryPayloads(workoutId: string, form: WorkoutFormState): ScheduleEntryCreate[] {
  if (!form.repeat) {
    return [{ workout_id: workoutId, on_date: format(form.date, 'yyyy-MM-dd') }];
  }

  const startsOn = format(form.startingOn, 'yyyy-MM-dd');
  const endsOn = form.endingOn ? format(form.endingOn, 'yyyy-MM-dd') : undefined;

  return form.selectedWeekdays.map((dayOfWeek) => ({
    workout_id: workoutId,
    day_of_week: dayOfWeek,
    starts_on: startsOn,
    ...(endsOn ? { ends_on: endsOn } : {}),
  }));
}

/**
 * A dated cancellation against `rootEntryId` -- no workout_id, no
 * name_override, no day_of_week/bounds. Always points at the root, never at
 * whatever it's superseding, so a cancel-after-swap can't deepen the chain.
 */
export function cancellationPayload(rootEntryId: string, dateParam: string): ScheduleEntryCreate {
  return { on_date: dateParam, replaces_entry_id: rootEntryId };
}

/**
 * A dated replacement against `rootEntryId` for `workoutId` -- no
 * name_override, no day_of_week/bounds. Always points at the root, never at
 * whatever it's superseding (see cancellationPayload).
 */
export function replacementPayload(rootEntryId: string, dateParam: string, workoutId: string): ScheduleEntryCreate {
  return { on_date: dateParam, replaces_entry_id: rootEntryId, workout_id: workoutId };
}
