import type { ScheduleEntry } from './blastRadius';
import {
  changeToExistingWorkoutPatch,
  changeToNewNamePatch,
  dateRangeError,
  datedSchedulePatch,
  patchThenClearStranded,
  recurringSchedulePatch,
  stopRepeatingPatch,
} from './scheduleEdit';

function makeEntry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    created_at: '2026-01-01T00:00:00Z',
    day_of_week: null,
    ends_on: null,
    id: 'root',
    name_override: null,
    on_date: null,
    plan_id: 'plan-1',
    replaces_entry_id: null,
    starts_on: null,
    workout_id: 'push',
    ...overrides,
  };
}

describe('recurringSchedulePatch', () => {
  it('is empty when nothing changed', () => {
    const entry = makeEntry({ day_of_week: 1, starts_on: '2026-08-01', ends_on: null });
    expect(recurringSchedulePatch(entry, 1, '2026-08-01', null)).toEqual({});
  });

  it('sends only day_of_week when only the weekday changed', () => {
    const entry = makeEntry({ day_of_week: 1, starts_on: null, ends_on: null });
    expect(recurringSchedulePatch(entry, 3, null, null)).toEqual({ day_of_week: 3 });
  });

  it('sends only starts_on/ends_on when only bounds changed', () => {
    const entry = makeEntry({ day_of_week: 1, starts_on: null, ends_on: null });
    expect(recurringSchedulePatch(entry, 1, '2026-08-01', '2026-08-31')).toEqual({
      starts_on: '2026-08-01',
      ends_on: '2026-08-31',
    });
  });

  it('can clear a bound back to null', () => {
    const entry = makeEntry({ day_of_week: 1, starts_on: '2026-08-01', ends_on: '2026-08-31' });
    expect(recurringSchedulePatch(entry, 1, '2026-08-01', null)).toEqual({ ends_on: null });
  });

  it('never sends on_date -- the kind-lock would reject it', () => {
    const entry = makeEntry({ day_of_week: 1 });
    const patch = recurringSchedulePatch(entry, 3, null, null);
    expect(patch).not.toHaveProperty('on_date');
  });
});

describe('datedSchedulePatch', () => {
  it('is empty when the date is unchanged', () => {
    const entry = makeEntry({ on_date: '2026-08-18' });
    expect(datedSchedulePatch(entry, '2026-08-18')).toEqual({});
  });

  it('sends only on_date when it changed', () => {
    const entry = makeEntry({ on_date: '2026-08-18' });
    expect(datedSchedulePatch(entry, '2026-08-19')).toEqual({ on_date: '2026-08-19' });
  });

  it('never sends day_of_week/starts_on/ends_on -- the kind-lock would reject them', () => {
    const entry = makeEntry({ on_date: '2026-08-18' });
    const patch = datedSchedulePatch(entry, '2026-08-19');
    expect(patch).not.toHaveProperty('day_of_week');
    expect(patch).not.toHaveProperty('starts_on');
    expect(patch).not.toHaveProperty('ends_on');
  });
});

describe('stopRepeatingPatch', () => {
  it('sends ends_on as the given date, formatted', () => {
    expect(stopRepeatingPatch(new Date(2026, 7, 14))).toEqual({ ends_on: '2026-08-14' });
  });
});

describe('changeToExistingWorkoutPatch / changeToNewNamePatch', () => {
  it('picking an existing workout sends workout_id and the paired name_override: null', () => {
    expect(changeToExistingWorkoutPatch('legs')).toEqual({ workout_id: 'legs', name_override: null });
  });

  it('typing a new name sends name_override and the paired workout_id: null', () => {
    expect(changeToNewNamePatch('Grandma stretches')).toEqual({
      name_override: 'Grandma stretches',
      workout_id: null,
    });
  });

  it('changing the root leaves an existing replacement row untouched -- the PATCH addresses only the root by id', () => {
    const root = makeEntry({ id: 'root', day_of_week: 1, workout_id: 'push' });
    const replacement = makeEntry({
      id: 'rep',
      replaces_entry_id: 'root',
      on_date: '2026-08-17',
      workout_id: 'yoga',
    });
    const entries = [root, replacement];

    // What a successful PATCH does to the cache: only the addressed row changes.
    const patch = changeToExistingWorkoutPatch('legs');
    const afterPatch = entries.map((entry) => (entry.id === root.id ? { ...entry, ...patch } : entry));

    const replacementAfter = afterPatch.find((entry) => entry.id === 'rep');
    expect(replacementAfter).toBe(replacement);
    expect(replacementAfter?.replaces_entry_id).toBe('root');
    expect(replacementAfter?.workout_id).toBe('yoga');
  });
});

describe('dateRangeError', () => {
  it('is null when both are blank', () => {
    expect(dateRangeError(null, null)).toBeNull();
  });

  it('is null when only one is set', () => {
    expect(dateRangeError(new Date(2026, 7, 1), null)).toBeNull();
    expect(dateRangeError(null, new Date(2026, 7, 1))).toBeNull();
  });

  it('errors when ending precedes starting', () => {
    expect(dateRangeError(new Date(2026, 7, 15), new Date(2026, 7, 1))).toBe(
      'Ending on must be on or after starting on',
    );
  });

  it('is null when ending is on or after starting', () => {
    expect(dateRangeError(new Date(2026, 7, 1), new Date(2026, 7, 1))).toBeNull();
    expect(dateRangeError(new Date(2026, 7, 1), new Date(2026, 7, 15))).toBeNull();
  });
});

describe('patchThenClearStranded', () => {
  it('calls patchEntry before any deletes', async () => {
    const calls: string[] = [];
    const patchEntry = jest.fn(async () => {
      calls.push('patch');
    });
    const deleteEntry = jest.fn(async (id: string) => {
      calls.push(`delete:${id}`);
    });

    await patchThenClearStranded(patchEntry, ['a', 'b'], deleteEntry);

    expect(calls[0]).toBe('patch');
    expect(calls.slice(1).sort()).toEqual(['delete:a', 'delete:b']);
  });

  it('never attempts deletes if the patch itself fails', async () => {
    const patchEntry = jest.fn(async () => {
      throw new Error('patch failed');
    });
    const deleteEntry = jest.fn(async () => {});

    await expect(patchThenClearStranded(patchEntry, ['a'], deleteEntry)).rejects.toThrow('patch failed');
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it('reports partial delete failure honestly rather than rolling back', async () => {
    const patchEntry = jest.fn(async () => {});
    const deleteEntry = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'));

    const result = await patchThenClearStranded(patchEntry, ['a', 'b'], deleteEntry);

    expect(result).toEqual({ failedCount: 1 });
  });

  it('reports zero failures when there is nothing to clear', async () => {
    const patchEntry = jest.fn(async () => {});
    const deleteEntry = jest.fn(async () => {});

    const result = await patchThenClearStranded(patchEntry, [], deleteEntry);

    expect(result).toEqual({ failedCount: 0 });
    expect(deleteEntry).not.toHaveBeenCalled();
  });
});
