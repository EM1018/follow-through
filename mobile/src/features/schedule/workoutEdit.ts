import type { Activity } from '@/features/logs/activities';

import type { WorkoutRead, WorkoutUpdate } from './api';

/** Only the fields that actually changed -- PATCH bodies use extra="forbid" and must stay minimal. */
export function buildWorkoutPatch(
  workout: WorkoutRead,
  name: string,
  notes: string,
  activity: Activity | null,
): WorkoutUpdate {
  const patch: WorkoutUpdate = {};

  const trimmedName = name.trim();
  if (trimmedName !== workout.name) {
    patch.name = trimmedName;
  }

  const normalizedNotes = notes.trim() || null;
  if (normalizedNotes !== workout.notes) {
    patch.notes = normalizedNotes;
  }

  if (activity !== workout.activity) {
    patch.activity = activity;
  }

  return patch;
}

export function isWorkoutDirty(workout: WorkoutRead, name: string, notes: string, activity: Activity | null): boolean {
  return Object.keys(buildWorkoutPatch(workout, name, notes, activity)).length > 0;
}

export function canSaveWorkout(workout: WorkoutRead, name: string, notes: string, activity: Activity | null): boolean {
  return isWorkoutDirty(workout, name, notes, activity) && name.trim().length > 0;
}
