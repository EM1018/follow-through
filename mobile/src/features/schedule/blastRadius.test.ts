import {
  dependentsOf,
  describeEntry,
  entriesForWorkout,
  entryDeleteImpact,
  siblingWeekdays,
  workoutDeleteImpact,
  type ScheduleEntry,
  type Workout,
  type WorkoutsById,
} from './blastRadius';

const PLAN_ID = 'plan-1';

function makeEntry(id: string, overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    created_at: '2026-01-01T00:00:00Z',
    day_of_week: null,
    ends_on: null,
    id,
    name_override: null,
    on_date: null,
    plan_id: PLAN_ID,
    replaces_entry_id: null,
    starts_on: null,
    workout_id: null,
    ...overrides,
  };
}

function makeWorkout(id: string, name: string): Workout {
  return { id, name, notes: null, plan_id: PLAN_ID, created_at: '2026-01-01T00:00:00Z' };
}

describe('entriesForWorkout', () => {
  it('returns only direct references to the workout', () => {
    const w1 = makeEntry('e1', { workout_id: 'w1' });
    const w2 = makeEntry('e2', { workout_id: 'w2' });
    const w3 = makeEntry('e3', { workout_id: 'w1' });

    expect(entriesForWorkout([w1, w2, w3], 'w1')).toEqual([w1, w3]);
  });
});

describe('dependentsOf', () => {
  it('returns [] for an entry with no dependents', () => {
    const e = makeEntry('e1');
    expect(dependentsOf([e], 'e1')).toEqual([]);
  });

  it('reports the immediate child and the two-deep grandchild for a chain D2 -> D1 -> E', () => {
    const e = makeEntry('e');
    const d1 = makeEntry('d1', { replaces_entry_id: 'e' });
    const d2 = makeEntry('d2', { replaces_entry_id: 'd1' });
    const entries = [e, d1, d2];

    expect(dependentsOf(entries, 'd1')).toEqual([d2]);
    expect(dependentsOf(entries, 'e')).toEqual(expect.arrayContaining([d1, d2]));
    expect(dependentsOf(entries, 'e')).toHaveLength(2);
  });

  it('terminates on a malformed cycle instead of hanging', () => {
    const a = makeEntry('a', { replaces_entry_id: 'b' });
    const b = makeEntry('b', { replaces_entry_id: 'a' });

    expect(dependentsOf([a, b], 'a')).toEqual([b]);
  });
});

describe('workoutDeleteImpact', () => {
  it('separates direct references from cascaded dependents, excluding anything already direct', () => {
    const direct1 = makeEntry('direct1', { workout_id: 'w1' });
    const direct2 = makeEntry('direct2', { workout_id: 'w1' });
    const cascaded = makeEntry('cascaded', { replaces_entry_id: 'direct1' });
    const other = makeEntry('other', { workout_id: 'w2' });

    const impact = workoutDeleteImpact([direct1, direct2, cascaded, other], 'w1');

    expect(impact.direct).toEqual([direct1, direct2]);
    expect(impact.cascaded).toEqual([cascaded]);
  });
});

describe('entryDeleteImpact', () => {
  it('returns the root entry and its transitive dependents', () => {
    const root = makeEntry('root');
    const child = makeEntry('child', { replaces_entry_id: 'root' });

    const impact = entryDeleteImpact([root, child], 'root');

    expect(impact.root).toEqual(root);
    expect(impact.dependents).toEqual([child]);
  });
});

describe('siblingWeekdays', () => {
  it('detects an MWF trio: same workout, same bounds, different weekday', () => {
    const mon = makeEntry('mon', { workout_id: 'w1', day_of_week: 1, starts_on: '2026-08-01', ends_on: null });
    const wed = makeEntry('wed', { workout_id: 'w1', day_of_week: 3, starts_on: '2026-08-01', ends_on: null });
    const fri = makeEntry('fri', { workout_id: 'w1', day_of_week: 5, starts_on: '2026-08-01', ends_on: null });
    const otherBounds = makeEntry('other-bounds', {
      workout_id: 'w1',
      day_of_week: 2,
      starts_on: '2026-09-01',
      ends_on: null,
    });

    expect(siblingWeekdays([mon, wed, fri, otherBounds], mon)).toEqual([wed, fri]);
  });

  it('returns [] for a dated entry', () => {
    const dated = makeEntry('dated', { workout_id: 'w1', on_date: '2026-08-18' });
    const other = makeEntry('other', { workout_id: 'w1', day_of_week: 2, starts_on: '2026-08-01' });

    expect(siblingWeekdays([dated, other], dated)).toEqual([]);
  });
});

describe('describeEntry', () => {
  const workoutsById: WorkoutsById = { w1: makeWorkout('w1', 'Legs') };

  it('describes a recurring entry with no bounds', () => {
    const entry = makeEntry('e1', { day_of_week: 1, starts_on: '2026-08-01', ends_on: null });
    expect(describeEntry(entry, workoutsById)).toBe('every Monday');
  });

  it('describes a recurring entry with bounds', () => {
    const entry = makeEntry('e1', { day_of_week: 1, starts_on: '2026-08-15', ends_on: '2026-09-15' });
    expect(describeEntry(entry, workoutsById)).toBe('every Monday, Aug 15 – Sep 15');
  });

  it('describes a dated entry', () => {
    const entry = makeEntry('e1', { on_date: '2026-08-18' });
    expect(describeEntry(entry, workoutsById)).toBe('Tue, Aug 18');
  });

  it('describes a cancellation: replaces_entry_id set, no workout', () => {
    const entry = makeEntry('e1', { replaces_entry_id: 'root', workout_id: null });
    expect(describeEntry(entry, workoutsById)).toBe('cancelled');
  });

  it('describes a substitution: replaces_entry_id set, with a resolvable workout', () => {
    const entry = makeEntry('e1', { replaces_entry_id: 'root', workout_id: 'w1' });
    expect(describeEntry(entry, workoutsById)).toBe('swapped for Legs');
  });

  it('falls back to "a deleted workout" rather than a uuid when the workout lookup misses', () => {
    const entry = makeEntry('e1', { replaces_entry_id: 'root', workout_id: 'missing-id' });
    expect(describeEntry(entry, workoutsById)).toBe('swapped for a deleted workout');
  });
});
