import type { ScheduleEntry, ScheduleEntryPatch, Workout, WorkoutsById } from './blastRadius';
import {
  changeWorkoutConfirmCopy,
  moveConfirmCopy,
  moveFailureMessage,
  stopRepeatingConfirmCopy,
  stopRepeatingFailureMessage,
} from './scheduleEditCopy';

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

const workoutsById: WorkoutsById = { yoga: makeWorkout('yoga', 'Yoga') };

describe('moveConfirmCopy', () => {
  const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });

  it('matches the spec example exactly: one stranded replacement, one stranded cancellation, weekday move', () => {
    const replacement = makeEntry('rep', { replaces_entry_id: 'root', on_date: '2026-08-17', workout_id: 'yoga' });
    const cancellation = makeEntry('cancel', {
      replaces_entry_id: 'root',
      on_date: '2026-08-24',
      workout_id: null,
      name_override: null,
    });
    const patch: ScheduleEntryPatch = { day_of_week: 3 };

    const copy = moveConfirmCopy(
      'Push',
      root,
      patch,
      { replacements: [replacement], cancellations: [cancellation] },
      workoutsById,
    );

    expect(copy.title).toBe('Move Push to Wednesdays?');
    expect(copy.message).toContain(
      'Mon, Aug 17 will keep showing Yoga in place of Push, even though Push no longer happens on Mondays.',
    );
    expect(copy.message).toContain('Your cancellation on Mon, Aug 24 will have nothing left to cancel.');
  });

  it('warns about past occurrences only when day_of_week is part of the patch', () => {
    const replacement = makeEntry('rep', { replaces_entry_id: 'root', on_date: '2026-08-17', workout_id: 'yoga' });

    const withWeekdayChange = moveConfirmCopy(
      'Push',
      root,
      { day_of_week: 3 },
      { replacements: [replacement], cancellations: [] },
      workoutsById,
    );
    expect(withWeekdayChange.message).toMatch(/past occurrences/);

    const boundsOnly = moveConfirmCopy(
      'Push',
      root,
      { ends_on: '2026-08-20' },
      { replacements: [replacement], cancellations: [] },
      workoutsById,
    );
    expect(boundsOnly.message).not.toMatch(/past occurrences/);
  });

  it('titles a bounds-only change generically, and a dated move by its new date', () => {
    const boundsOnly = moveConfirmCopy('Push', root, { ends_on: '2026-08-20' }, { replacements: [], cancellations: [] }, workoutsById);
    expect(boundsOnly.title).toBe("Change Push's schedule?");

    const datedRoot = makeEntry('root2', { on_date: '2026-08-10', workout_id: 'push' });
    const datedMove = moveConfirmCopy(
      'Push',
      datedRoot,
      { on_date: '2026-08-19' },
      { replacements: [], cancellations: [] },
      workoutsById,
    );
    expect(datedMove.title).toBe('Move Push to Wed, Aug 19?');
  });

  it('enumerates multiple stranded rows rather than just counting them', () => {
    const rep1 = makeEntry('rep1', { replaces_entry_id: 'root', on_date: '2026-08-17', workout_id: 'yoga' });
    const rep2 = makeEntry('rep2', { replaces_entry_id: 'root', on_date: '2026-08-31', workout_id: 'yoga' });

    const copy = moveConfirmCopy(
      'Push',
      root,
      { day_of_week: 3 },
      { replacements: [rep1, rep2], cancellations: [] },
      workoutsById,
    );

    expect(copy.message).toContain('Mon, Aug 17, Mon, Aug 31');
  });
});

describe('stopRepeatingConfirmCopy', () => {
  const root = makeEntry('root', { day_of_week: 1, starts_on: null, ends_on: null, workout_id: 'push' });

  it('always includes the base sentence, even with nothing stranded', () => {
    const copy = stopRepeatingConfirmCopy('Push', root, { replacements: [], cancellations: [] }, workoutsById);

    expect(copy.title).toBe('Stop repeating Push?');
    expect(copy.message).toBe('Push will stop repeating after today. Mondays before today stay as they are.');
  });

  it('appends stranding sentences when strandedBy found something', () => {
    const cancellation = makeEntry('cancel', {
      replaces_entry_id: 'root',
      on_date: '2026-08-24',
      workout_id: null,
      name_override: null,
    });

    const copy = stopRepeatingConfirmCopy(
      'Push',
      root,
      { replacements: [], cancellations: [cancellation] },
      workoutsById,
    );

    expect(copy.message).toContain('Push will stop repeating after today.');
    expect(copy.message).toContain('Your cancellation on Mon, Aug 24 will have nothing left to cancel.');
  });
});

describe('moveFailureMessage', () => {
  it('names the new weekday, singular day', () => {
    expect(moveFailureMessage({ day_of_week: 3 }, 1)).toBe("Moved to Wednesdays, but couldn't clear 1 leftover day.");
  });

  it('names the new date for a dated move, plural days', () => {
    expect(moveFailureMessage({ on_date: '2026-08-19' }, 2)).toBe(
      "Moved to Wed, Aug 19, but couldn't clear 2 leftover days.",
    );
  });

  it('falls back to a generic phrase for a bounds-only change', () => {
    expect(moveFailureMessage({ ends_on: '2026-08-20' }, 1)).toBe(
      "Moved to the new schedule, but couldn't clear 1 leftover day.",
    );
  });
});

describe('stopRepeatingFailureMessage', () => {
  it('pluralizes correctly', () => {
    expect(stopRepeatingFailureMessage(1)).toBe("Stopped repeating, but couldn't clear 1 leftover day.");
    expect(stopRepeatingFailureMessage(2)).toBe("Stopped repeating, but couldn't clear 2 leftover days.");
  });
});

describe('changeWorkoutConfirmCopy', () => {
  it('names the workout and the weekday for a recurring entry, matching the spec example', () => {
    const root = makeEntry('root', { day_of_week: 1, workout_id: 'push' });

    const copy = changeWorkoutConfirmCopy(root, 'Legs');

    expect(copy.title).toBe('Change every Monday to Legs?');
    expect(copy.message).toBe(
      'Every Monday becomes Legs, including Mondays already past. Days you swapped individually keep their swaps.',
    );
  });

  it('names the workout and the date for a dated entry, with no past-occurrences or swapped-days clause', () => {
    const root = makeEntry('root', { on_date: '2026-08-18', workout_id: 'push' });

    const copy = changeWorkoutConfirmCopy(root, 'Legs');

    expect(copy.title).toBe('Change Tue, Aug 18 to Legs?');
    expect(copy.message).toBe('Tue, Aug 18 becomes Legs.');
    expect(copy.message).not.toMatch(/already past|swapped individually/);
  });
});
