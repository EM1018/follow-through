import type { WorkoutRead } from './api';
import { buildWorkoutPatch, canSaveWorkout, isWorkoutDirty } from './workoutEdit';

function makeWorkout(overrides: Partial<WorkoutRead> = {}): WorkoutRead {
  return {
    id: 'w1',
    plan_id: 'plan-1',
    created_at: '2026-01-01T00:00:00Z',
    name: 'Push Day',
    notes: 'Bench focus',
    activity: null,
    ...overrides,
  };
}

describe('buildWorkoutPatch', () => {
  it('is empty when nothing changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, workout.name, workout.notes ?? '', workout.activity)).toEqual({});
  });

  it('sends only name when only the name changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, 'Pull Day', workout.notes ?? '', workout.activity)).toEqual({ name: 'Pull Day' });
  });

  it('sends only notes when only notes changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, workout.name, 'New notes', workout.activity)).toEqual({ notes: 'New notes' });
  });

  it('sends both when both changed', () => {
    const workout = makeWorkout();
    expect(buildWorkoutPatch(workout, 'Pull Day', 'New notes', workout.activity)).toEqual({
      name: 'Pull Day',
      notes: 'New notes',
    });
  });

  it('trims the name and treats blank notes as null, matching the stored value', () => {
    const workout = makeWorkout({ notes: null });
    expect(buildWorkoutPatch(workout, '  Push Day  ', '   ', workout.activity)).toEqual({});
  });

  it('normalizes blank notes to null when notes actually changed', () => {
    const workout = makeWorkout({ notes: 'Bench focus' });
    expect(buildWorkoutPatch(workout, workout.name, '   ', workout.activity)).toEqual({ notes: null });
  });

  it('sends only activity when only activity changed', () => {
    const workout = makeWorkout({ activity: null });
    expect(buildWorkoutPatch(workout, workout.name, workout.notes ?? '', 'strength_training')).toEqual({
      activity: 'strength_training',
    });
  });

  it('sends activity: null when clearing a tagged workout back to none', () => {
    const workout = makeWorkout({ activity: 'strength_training' });
    expect(buildWorkoutPatch(workout, workout.name, workout.notes ?? '', null)).toEqual({ activity: null });
  });
});

describe('isWorkoutDirty', () => {
  it('is false when nothing changed', () => {
    const workout = makeWorkout();
    expect(isWorkoutDirty(workout, workout.name, workout.notes ?? '', workout.activity)).toBe(false);
  });

  it('is true when the name changed', () => {
    const workout = makeWorkout();
    expect(isWorkoutDirty(workout, 'Pull Day', workout.notes ?? '', workout.activity)).toBe(true);
  });

  it('is true when only notes changed', () => {
    const workout = makeWorkout();
    expect(isWorkoutDirty(workout, workout.name, 'New notes', workout.activity)).toBe(true);
  });

  it('is true when only activity changed', () => {
    const workout = makeWorkout({ activity: null });
    expect(isWorkoutDirty(workout, workout.name, workout.notes ?? '', 'cardio')).toBe(true);
  });
});

describe('canSaveWorkout', () => {
  it('is false until something is dirty', () => {
    const workout = makeWorkout();
    expect(canSaveWorkout(workout, workout.name, workout.notes ?? '', workout.activity)).toBe(false);
  });

  it('is false when the name is emptied, even though that is a change', () => {
    const workout = makeWorkout();
    expect(canSaveWorkout(workout, '   ', workout.notes ?? '', workout.activity)).toBe(false);
  });

  it('is true once dirty with a non-empty name', () => {
    const workout = makeWorkout();
    expect(canSaveWorkout(workout, 'Pull Day', workout.notes ?? '', workout.activity)).toBe(true);
  });

  it('is true once dirty via activity alone, with the name unchanged', () => {
    const workout = makeWorkout({ activity: null });
    expect(canSaveWorkout(workout, workout.name, workout.notes ?? '', 'walking')).toBe(true);
  });
});
