import type { WorkoutRead, WorkoutUpdate } from './api';

/** Only the fields that actually changed -- PATCH bodies use extra="forbid" and must stay minimal. */
export function buildWorkoutPatch(workout: WorkoutRead, name: string, notes: string): WorkoutUpdate {
  const patch: WorkoutUpdate = {};

  const trimmedName = name.trim();
  if (trimmedName !== workout.name) {
    patch.name = trimmedName;
  }

  const normalizedNotes = notes.trim() || null;
  if (normalizedNotes !== workout.notes) {
    patch.notes = normalizedNotes;
  }

  return patch;
}

export function isWorkoutDirty(workout: WorkoutRead, name: string, notes: string): boolean {
  return Object.keys(buildWorkoutPatch(workout, name, notes)).length > 0;
}

export function canSaveWorkout(workout: WorkoutRead, name: string, notes: string): boolean {
  return isWorkoutDirty(workout, name, notes) && name.trim().length > 0;
}
