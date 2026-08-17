import { pickerEmptyMessage, type Workout } from './workoutPicker';

function makeWorkout(id: string, name: string): Workout {
  return { id, name, notes: null, plan_id: 'plan-1', created_at: '2026-01-01T00:00:00Z' };
}

describe('pickerEmptyMessage', () => {
  it('reports no workouts at all when the plan has none', () => {
    expect(pickerEmptyMessage([], null)).toBe('No workouts in this plan yet.');
  });

  it('reports no OTHER workouts when the only workout is the one on this day', () => {
    const legs = makeWorkout('legs', 'Legs');
    expect(pickerEmptyMessage([legs], 'legs')).toBe('No other workouts in this plan yet.');
  });

  it('is null (list renders) when the only workout is not the one on this day', () => {
    const legs = makeWorkout('legs', 'Legs');
    expect(pickerEmptyMessage([legs], null)).toBeNull();
    expect(pickerEmptyMessage([legs], 'arms')).toBeNull();
  });

  it('is null (list renders) whenever more than one workout exists, current or not', () => {
    const legs = makeWorkout('legs', 'Legs');
    const arms = makeWorkout('arms', 'Arms');
    expect(pickerEmptyMessage([legs, arms], 'legs')).toBeNull();
  });
});
