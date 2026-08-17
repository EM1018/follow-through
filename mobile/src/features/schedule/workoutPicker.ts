import type { components } from '@/api/schema';

export type Workout = components['schemas']['WorkoutRead'];

/**
 * null when the picker's list should render; otherwise the empty-state
 * message. The current day's workout is excluded from what's selectable
 * (see WorkoutPickerSheet), so a plan whose only workout is already on this
 * day has nothing left to pick -- same empty state as a plan with none at all,
 * worded to match which case it is.
 */
export function pickerEmptyMessage(workouts: Workout[], currentWorkoutId: string | null): string | null {
  if (workouts.length === 0) {
    return 'No workouts in this plan yet.';
  }
  if (workouts.length === 1 && workouts[0].id === currentWorkoutId) {
    return 'No other workouts in this plan yet.';
  }
  return null;
}
