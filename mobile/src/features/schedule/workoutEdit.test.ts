import type { WorkoutRead } from './api';
import { buildWorkoutPatch, canSaveWorkout, isWorkoutDirty } from './workoutEdit';

function makeWorkout(overrides: Partial<WorkoutRead> = {}): WorkoutRead {
  return {
    id: 'w1',
    plan_id: 'plan-1',
    created_at: '2026-01-01T00:00:00Z',
    name: 'Push Day',
    notes: 'Bench focus',
    ...overrides,
  };
}

describe('buildWorkoutPatch', () => {
  it('is empty when nothing changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, workout.name, workout.notes ?? '')).toEqual({});
  });

  it('sends only name when only the name changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, 'Pull Day', workout.notes ?? '')).toEqual({ name: 'Pull Day' });
  });

  it('sends only notes when only notes changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, workout.name, 'New notes')).toEqual({ notes: 'New notes' });
  });

  it('sends both when both changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, 'Pull Day', 'New notes')).toEqual({ name: 'Pull Day', notes: 'New notes' });
  });

  it('trims the name and treats blank notes as null, matching the stored value', () => {
    const workout = makeWorkout({ notes: null });
    expect(buildWorkoutPatch(workout, '  Push Day  ', '   ')).toEqual({});
  });

  it('normalizes blank notes to null when notes actually changed', () => {
    const workout = makeWorkout({ notes: 'Bench focus' });
    expect(buildWorkoutPatch(workout, workout.name, '   ')).toEqual({ notes: null });
  });
});

describe('isWorkoutDirty', () => {
  it('is false when nothing changed', () => {
    const workout = makeWorkout();
    expect(isWorkoutDirty(workout, workout.name, workout.notes ?? '')).toBe(false);
  });

  it('is true when the name changed', () => {
    const workout = makeWorkout();
    expect(isWorkoutDirty(workout, 'Pull Day', workout.notes ?? '')).toBe(true);
  });

  it('is true when only notes changed', () => {
    const workout = makeWorkout();
    expect(isWorkoutDirty(workout, workout.name, 'New notes')).toBe(true);
  });
});

describe('canSaveWorkout', () => {
  it('is false until something is dirty', () => {
    const workout = makeWorkout();
    expect(canSaveWorkout(workout, workout.name, workout.notes ?? '')).toBe(false);
  });

  it('is false when the name is emptied, even though that is a change', () => {
    const workout = makeWorkout();
    expect(canSaveWorkout(workout, '   ', workout.notes ?? '')).toBe(false);
  });

  it('is true once dirty with a non-empty name', () => {
    const workout = makeWorkout();
    expect(canSaveWorkout(workout, 'Pull Day', workout.notes ?? '')).toBe(true);
  });
});
