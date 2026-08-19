import type { ScheduleEntry, Workout, WorkoutsById } from './blastRadius';
import { entryDeleteDialogCopy, restoreDialogCopy, undoSwapDialogCopy, workoutDeleteDialogCopy } from './deleteCopy';

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
  return { id, name, notes: null, activity: null, plan_id: PLAN_ID, created_at: '2026-01-01T00:00:00Z' };
}

describe('workoutDeleteDialogCopy', () => {
  const workoutsById: WorkoutsById = { legs: makeWorkout('legs', 'Legs') };

  it('nothing scheduled', () => {
    const copy = workoutDeleteDialogCopy('Push Day', [], 'push', workoutsById);
    expect(copy).toEqual({
      title: 'Delete Push Day?',
      message: "It isn't scheduled on any day.",
    });
  });

  it('scheduled with no dependents lists each direct entry, never just a count', () => {
    const monday = makeEntry('mon', { workout_id: 'push', day_of_week: 1, starts_on: '2026-08-01', ends_on: null });
    const thursday = makeEntry('thu', { workout_id: 'push', day_of_week: 4, starts_on: '2026-08-01', ends_on: null });
    const dated = makeEntry('dated', { workout_id: 'push', on_date: '2026-08-18' });

    const copy = workoutDeleteDialogCopy('Push Day', [monday, thursday, dated], 'push', workoutsById);

    expect(copy.title).toBe('Delete Push Day?');
    expect(copy.message).toBe(
      'This also removes it from 3 scheduled days (every Monday; every Thursday; Tue, Aug 18), including days already past.',
    );
  });

  it('scheduled with dependents enumerates cascaded entries individually, not as a count', () => {
    const root = makeEntry('root', { workout_id: 'push', day_of_week: 1, starts_on: '2026-08-01', ends_on: null });
    const swap = makeEntry('swap', { replaces_entry_id: 'root', workout_id: 'legs', on_date: '2026-08-20' });
    const cancel = makeEntry('cancel', { replaces_entry_id: 'root', workout_id: null, on_date: '2026-08-27' });

    const copy = workoutDeleteDialogCopy('Push Day', [root, swap, cancel], 'push', workoutsById);

    expect(copy.message).toContain(
      'It also deletes 2 changes you made: Aug 20 — swapped for Legs; Aug 27 — cancelled.',
    );
    // Individually enumerated, not a bare count standing in for the list.
    expect(copy.message).not.toMatch(/deletes 2 changes you made:\s*\d+\.$/);
  });

  it('caps the cascaded enumeration at 5 items, then reports the remainder', () => {
    const root = makeEntry('root', { workout_id: 'push' });
    const cascaded = Array.from({ length: 6 }, (_, i) =>
      makeEntry(`c${i}`, { replaces_entry_id: 'root', workout_id: null, on_date: `2026-08-${10 + i}` }),
    );

    const copy = workoutDeleteDialogCopy('Push Day', [root, ...cascaded], 'push', workoutsById);

    expect(copy.message).toContain('and 1 more');
    expect(copy.message.split('; ')).toHaveLength(6); // 5 enumerated items + the "and 1 more" tail
  });
});

describe('entryDeleteDialogCopy', () => {
  const workoutsById: WorkoutsById = { legs: makeWorkout('legs', 'Legs') };

  it('dated entry', () => {
    const entry = makeEntry('e1', { workout_id: 'push', on_date: '2026-08-18' });
    const copy = entryDeleteDialogCopy('Push Day', entry, [entry], workoutsById);

    expect(copy).toEqual({
      title: 'Remove Push Day on Tue, Aug 18?',
      message: '',
      siblings: [],
    });
  });

  it('recurring entry, no bounds', () => {
    const entry = makeEntry('e1', { workout_id: 'push', day_of_week: 1, starts_on: '2026-08-01', ends_on: null });
    const copy = entryDeleteDialogCopy('Push Day', entry, [entry], workoutsById);

    expect(copy.title).toBe('Remove Push Day from every Monday?');
    expect(copy.message).toBe('This removes it from all Mondays, past and future.');
  });

  it('recurring entry with bounds includes them in the title', () => {
    const entry = makeEntry('e1', {
      workout_id: 'push',
      day_of_week: 1,
      starts_on: '2026-08-15',
      ends_on: '2026-09-15',
    });
    const copy = entryDeleteDialogCopy('Push Day', entry, [entry], workoutsById);

    expect(copy.title).toBe('Remove Push Day from every Monday, Aug 15 – Sep 15?');
  });

  it('reports siblings and leaves the swap/cancel description untouched by its own replaces_entry_id', () => {
    // The tapped entry is itself a swap (has replaces_entry_id) -- the title must still
    // describe WHEN it happens, not what kind of modification it is.
    const swapEntry = makeEntry('swap', { workout_id: 'push', replaces_entry_id: 'other', on_date: '2026-08-18' });
    const copy = entryDeleteDialogCopy('Push Day', swapEntry, [swapEntry], workoutsById);

    expect(copy.title).toBe('Remove Push Day on Tue, Aug 18?');
  });

  it('with siblings: names the days that stay and reports all of them', () => {
    const mon = makeEntry('mon', { workout_id: 'push', day_of_week: 1, starts_on: '2026-08-01', ends_on: null });
    const thu = makeEntry('thu', { workout_id: 'push', day_of_week: 4, starts_on: '2026-08-01', ends_on: null });
    const fri = makeEntry('fri', { workout_id: 'push', day_of_week: 5, starts_on: '2026-08-01', ends_on: null });

    const copy = entryDeleteDialogCopy('Push Day', mon, [mon, thu, fri], workoutsById);

    expect(copy.message).toBe('This removes it from all Mondays, past and future. Thursday and Friday will stay.');
    expect(copy.siblings).toEqual([thu, fri]);
  });

  it('with dependents: enumerates them exactly as the workout-delete dialog does', () => {
    const root = makeEntry('root', { workout_id: 'push', on_date: '2026-08-13' });
    const swap = makeEntry('swap', { replaces_entry_id: 'root', workout_id: 'legs', on_date: '2026-08-20' });

    const copy = entryDeleteDialogCopy('Push Day', root, [root, swap], workoutsById);

    expect(copy.message).toBe('This also deletes 1 change you made: Aug 20 — swapped for Legs.');
  });
});

describe('restoreDialogCopy', () => {
  const workoutsById: WorkoutsById = { legs: makeWorkout('legs', 'Legs') };

  it('titles the confirmation "Restore this day?" and enumerates dependents individually', () => {
    const dependent = makeEntry('dep', { replaces_entry_id: 'cancellation', workout_id: 'legs', on_date: '2026-08-20' });

    const copy = restoreDialogCopy([dependent], workoutsById);

    expect(copy).toEqual({
      title: 'Restore this day?',
      message: 'This also deletes 1 change you made: Aug 20 — swapped for Legs.',
    });
  });
});

describe('undoSwapDialogCopy', () => {
  const workoutsById: WorkoutsById = { legs: makeWorkout('legs', 'Legs') };

  it('titles the confirmation "Undo swap?" and enumerates dependents individually', () => {
    const dependent = makeEntry('dep', { replaces_entry_id: 'replacement', workout_id: null, on_date: '2026-08-20' });

    const copy = undoSwapDialogCopy([dependent], workoutsById);

    expect(copy).toEqual({
      title: 'Undo swap?',
      message: 'This also deletes 1 change you made: Aug 20 — cancelled.',
    });
  });
});
