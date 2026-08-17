import {
  actionsFor,
  dependentsOf,
  describeEntry,
  entriesForWorkout,
  entryAppliesOn,
  entryDeleteImpact,
  findCancellationEntry,
  rootEntryOf,
  siblingWeekdays,
  strandedBy,
  workoutDeleteImpact,
  type DaySchedule,
  type ScheduleEntry,
  type Workout,
  type WorkoutsById,
} from './blastRadius';

const PLAN_ID = 'plan-1';

// actionsFor's day-state branching lives entirely in the tapped entry's own
// shape (see the function's doc comment) -- this stands in wherever the
// signature still requires a DaySchedule.
const DUMMY_DAY: DaySchedule = { status: 'empty', entries: [], cancelled: [] };

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

describe('rootEntryOf', () => {
  it('returns the entry itself when it is already a root', () => {
    const root = makeEntry('root');
    expect(rootEntryOf([root], root)).toBe(root);
  });

  it('walks one hop up a flat replacement', () => {
    const root = makeEntry('root');
    const replacement = makeEntry('replacement', { replaces_entry_id: 'root', workout_id: 'w1' });
    expect(rootEntryOf([root, replacement], replacement)).toBe(root);
  });

  it('walks a multi-hop chain all the way to the root', () => {
    const root = makeEntry('root');
    const d1 = makeEntry('d1', { replaces_entry_id: 'root', workout_id: 'w1' });
    const d2 = makeEntry('d2', { replaces_entry_id: 'd1', workout_id: 'w2' });
    expect(rootEntryOf([root, d1, d2], d2)).toBe(root);
  });

  it('terminates on a malformed cycle instead of hanging, stopping at the first revisit', () => {
    const a = makeEntry('a', { replaces_entry_id: 'b' });
    const b = makeEntry('b', { replaces_entry_id: 'a' });
    expect(rootEntryOf([a, b], a)).toBe(b);
  });

  it('walks from a cancellation to its root the same way it walks from a replacement -- this is what makes swap-from-cancelled point at the root, not the cancellation', () => {
    const root = makeEntry('root', { day_of_week: 1, workout_id: 'w1' });
    const cancellation = makeEntry('cancellation', {
      on_date: '2026-08-18',
      replaces_entry_id: 'root',
      workout_id: null,
      name_override: null,
    });
    expect(rootEntryOf([root, cancellation], cancellation)).toBe(root);
  });
});

describe('findCancellationEntry', () => {
  it('finds the dated row that cancels the target on that date', () => {
    const root = makeEntry('root', { day_of_week: 1 });
    const cancellation = makeEntry('cancellation', {
      on_date: '2026-08-18',
      replaces_entry_id: 'root',
      workout_id: null,
      name_override: null,
    });
    expect(findCancellationEntry([root, cancellation], '2026-08-18', 'root')).toBe(cancellation);
  });

  it('does not match a replacement row for the same target and date', () => {
    const root = makeEntry('root', { day_of_week: 1 });
    const replacement = makeEntry('replacement', {
      on_date: '2026-08-18',
      replaces_entry_id: 'root',
      workout_id: 'w1',
    });
    expect(findCancellationEntry([root, replacement], '2026-08-18', 'root')).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(findCancellationEntry([], '2026-08-18', 'root')).toBeUndefined();
  });
});

describe('actionsFor', () => {
  it('offers cancel, swap, delete-every-weekday for a scheduled recurring occurrence', () => {
    const entry = makeEntry('root', { day_of_week: 1, workout_id: 'w1' });
    expect(actionsFor(DUMMY_DAY, entry)).toEqual(['cancel', 'swap', 'delete']);
  });

  it('offers swap, delete-this-day for a scheduled dated one-off (no cancel)', () => {
    const entry = makeEntry('root', { on_date: '2026-08-18', workout_id: 'w1' });
    expect(actionsFor(DUMMY_DAY, entry)).toEqual(['swap', 'delete']);
  });

  it('offers restore, swap for a cancellation', () => {
    const cancellation = makeEntry('cancellation', {
      on_date: '2026-08-18',
      replaces_entry_id: 'root',
      workout_id: null,
      name_override: null,
    });
    expect(actionsFor(DUMMY_DAY, cancellation)).toEqual(['restore', 'swap']);
  });

  it('offers change swap, undo swap, cancel for a replacement', () => {
    const replacement = makeEntry('replacement', {
      on_date: '2026-08-18',
      replaces_entry_id: 'root',
      workout_id: 'w1',
    });
    expect(actionsFor(DUMMY_DAY, replacement)).toEqual(['changeSwap', 'undoSwap', 'cancel']);
  });
});

// 2026-08-17 is a Monday, 2026-08-18 a Tuesday, 2026-08-24 the following Monday.
describe('entryAppliesOn', () => {
  it('recurring, in bounds: matches its weekday within starts_on/ends_on', () => {
    const entry = makeEntry('e1', { day_of_week: 1, starts_on: '2026-08-01', ends_on: '2026-08-31' });
    expect(entryAppliesOn(entry, new Date(2026, 7, 17))).toBe(true);
  });

  it('recurring, out of bounds: right weekday, but before starts_on or after ends_on', () => {
    const boundedLate = makeEntry('e1', { day_of_week: 1, starts_on: '2026-08-22', ends_on: null });
    expect(entryAppliesOn(boundedLate, new Date(2026, 7, 17))).toBe(false);

    const boundedEarly = makeEntry('e2', { day_of_week: 1, starts_on: null, ends_on: '2026-08-10' });
    expect(entryAppliesOn(boundedEarly, new Date(2026, 7, 17))).toBe(false);

    const wrongWeekday = makeEntry('e3', { day_of_week: 3, starts_on: null, ends_on: null });
    expect(entryAppliesOn(wrongWeekday, new Date(2026, 7, 17))).toBe(false);
  });

  it('recurring, unbounded: matches its weekday with no starts_on/ends_on at all', () => {
    const entry = makeEntry('e1', { day_of_week: 1, starts_on: null, ends_on: null });
    expect(entryAppliesOn(entry, new Date(2026, 7, 17))).toBe(true);
    expect(entryAppliesOn(entry, new Date(2026, 7, 24))).toBe(true);
  });

  it('dated: matches only its exact on_date', () => {
    const entry = makeEntry('e1', { on_date: '2026-08-18' });
    expect(entryAppliesOn(entry, new Date(2026, 7, 18))).toBe(true);
    expect(entryAppliesOn(entry, new Date(2026, 7, 19))).toBe(false);
  });
});

describe('strandedBy', () => {
  it('a weekday move strands a replacement whose dated row stays on the old day', () => {
    const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });
    const replacement = makeEntry('rep', {
      replaces_entry_id: 'root',
      on_date: '2026-08-17',
      workout_id: 'yoga',
    });

    const result = strandedBy([root, replacement], root, { day_of_week: 3 });

    expect(result.replacements).toEqual([replacement]);
    expect(result.cancellations).toEqual([]);
  });

  it('a weekday move strands a cancellation whose dated row stays on the old day', () => {
    const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });
    const cancellation = makeEntry('cancel', {
      replaces_entry_id: 'root',
      on_date: '2026-08-17',
      workout_id: null,
      name_override: null,
    });

    const result = strandedBy([root, cancellation], root, { day_of_week: 3 });

    expect(result.cancellations).toEqual([cancellation]);
    expect(result.replacements).toEqual([]);
  });

  it('a narrowed ends_on strands a later dependent', () => {
    const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });
    const later = makeEntry('rep', { replaces_entry_id: 'root', on_date: '2026-08-24', workout_id: 'yoga' });

    const result = strandedBy([root, later], root, { ends_on: '2026-08-20' });

    expect(result.replacements).toEqual([later]);
  });

  it("a starts_on pushed later strands an earlier dependent that's now before the window", () => {
    const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });
    const earlier = makeEntry('rep', { replaces_entry_id: 'root', on_date: '2026-08-17', workout_id: 'yoga' });

    const result = strandedBy([root, earlier], root, { starts_on: '2026-08-22' });

    expect(result.replacements).toEqual([earlier]);
  });

  it('a workout_id patch strands nothing, even with a dependent that would otherwise still match', () => {
    const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });
    const replacement = makeEntry('rep', { replaces_entry_id: 'root', on_date: '2026-08-17', workout_id: 'yoga' });

    const result = strandedBy([root, replacement], root, { workout_id: 'legs' });

    expect(result).toEqual({ replacements: [], cancellations: [] });
  });

  it('a move the dependent still matches afterward strands nothing', () => {
    const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });
    const replacement = makeEntry('rep', { replaces_entry_id: 'root', on_date: '2026-08-17', workout_id: 'yoga' });

    // Still Monday, still within the new (wider) bounds.
    const result = strandedBy([root, replacement], root, { starts_on: '2026-08-01' });

    expect(result).toEqual({ replacements: [], cancellations: [] });
  });
});
