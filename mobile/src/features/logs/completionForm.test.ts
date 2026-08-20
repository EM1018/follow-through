import {
  buildPatch,
  canSave,
  canSaveEdit,
  groupUnitsByDimension,
  resetUnitForActivity,
  type CompletionForm,
} from './completionForm';

import type { ActivityInfo, UnitInfo } from './activities';
import type { CompletionRead } from './completions';

function form(overrides: Partial<CompletionForm>): CompletionForm {
  return {
    activity: null,
    value: '',
    unit: null,
    onDate: '2026-08-17',
    note: '',
    ...overrides,
  };
}

function completion(overrides: Partial<CompletionRead>): CompletionRead {
  return {
    activity: 'running',
    created_at: '2026-08-10T12:00:00Z',
    id: 'c1',
    label: 'Running',
    note: null,
    on_date: '2026-08-10',
    schedule_entry_id: null,
    source: 'standalone',
    unit: null,
    value: null,
    ...overrides,
  };
}

describe('canSave', () => {
  it('is false with no activity', () => {
    expect(canSave(form({}))).toBe(false);
  });

  it('is true with just an activity', () => {
    expect(canSave(form({ activity: 'running' }))).toBe(true);
  });

  it('is true with activity, value, and unit', () => {
    expect(canSave(form({ activity: 'running', value: '3', unit: 'miles' }))).toBe(true);
  });

  it('is false with a value but no unit', () => {
    expect(canSave(form({ activity: 'running', value: '3', unit: null }))).toBe(false);
  });

  it('is false with a value of 0 or negative', () => {
    expect(canSave(form({ activity: 'running', value: '0', unit: 'miles' }))).toBe(false);
    expect(canSave(form({ activity: 'running', value: '-5', unit: 'miles' }))).toBe(false);
  });
});

describe('resetUnitForActivity', () => {
  const running: ActivityInfo = {
    activity: 'running',
    default_unit: 'miles',
    display_name: 'Running',
    units: ['minutes', 'hours', 'miles', 'kilometers'],
  };
  const strength: ActivityInfo = {
    activity: 'strength_training',
    default_unit: null,
    display_name: 'Strength training',
    units: ['sets', 'reps'],
  };

  it('keeps the unit when it is still permitted', () => {
    expect(resetUnitForActivity('miles', running)).toBe('miles');
  });

  it('clears the unit when it is no longer permitted', () => {
    expect(resetUnitForActivity('miles', strength)).toBe(strength.default_unit);
  });

  it('applies the new default when one exists', () => {
    expect(resetUnitForActivity('sets', running)).toBe('miles');
  });

  it('applies no default when the new activity has none', () => {
    expect(resetUnitForActivity(null, strength)).toBeNull();
  });
});

describe('groupUnitsByDimension', () => {
  const unitInfos: UnitInfo[] = [
    { unit: 'minutes', dimension: 'time' },
    { unit: 'hours', dimension: 'time' },
    { unit: 'miles', dimension: 'distance' },
    { unit: 'kilometers', dimension: 'distance' },
    { unit: 'sets', dimension: 'count' },
    { unit: 'reps', dimension: 'count' },
  ];

  it('groups and orders time before distance before count', () => {
    const groups = groupUnitsByDimension(['kilometers', 'sets', 'minutes', 'miles'], unitInfos);
    expect(groups).toEqual([['minutes'], ['kilometers', 'miles'], ['sets']]);
  });
});

describe('buildPatch', () => {
  it('is empty when nothing changed', () => {
    const original = completion({ activity: 'running', note: 'hi', value: 3, unit: 'miles' });
    const f = form({ activity: 'running', note: 'hi', value: '3', unit: 'miles' });
    expect(buildPatch(original, f)).toEqual({});
  });

  it('contains only the note when just the note changed', () => {
    const original = completion({ activity: 'running', note: 'old', value: null, unit: null });
    const f = form({ activity: 'running', note: 'new', value: '', unit: null });
    expect(buildPatch(original, f)).toEqual({ note: 'new' });
  });

  it('nulls both value and unit when the value is cleared', () => {
    const original = completion({ activity: 'running', value: 3, unit: 'miles', note: null });
    const f = form({ activity: 'running', value: '', unit: null, note: '' });
    expect(buildPatch(original, f)).toEqual({ value: null, unit: null });
  });

  it('contains only activity when just activity changed', () => {
    const original = completion({ activity: 'running', note: 'hi', value: 3, unit: 'miles' });
    const f = form({ activity: 'strength_training', note: 'hi', value: '3', unit: 'miles' });
    expect(buildPatch(original, f)).toEqual({ activity: 'strength_training' });
  });

  it('includes activity: null when clearing it back to unset', () => {
    const original = completion({ activity: 'running', note: 'hi', value: null, unit: null });
    const f = form({ activity: null, note: 'hi', value: '', unit: null });
    expect(buildPatch(original, f)).toEqual({ activity: null });
  });
});

describe('canSaveEdit', () => {
  it('is false when nothing changed', () => {
    const original = completion({ activity: 'running', note: 'hi', value: 3, unit: 'miles' });
    const f = form({ activity: 'running', note: 'hi', value: '3', unit: 'miles' });
    expect(canSaveEdit(original, f)).toBe(false);
  });

  it('is true once a field changes', () => {
    const original = completion({ activity: 'running', note: 'hi', value: 3, unit: 'miles' });
    const f = form({ activity: 'running', note: 'hi there', value: '3', unit: 'miles' });
    expect(canSaveEdit(original, f)).toBe(true);
  });

  it('is true when only activity changed', () => {
    const original = completion({ activity: 'running', note: 'hi', value: 3, unit: 'miles' });
    const f = form({ activity: 'cardio', note: 'hi', value: '3', unit: 'miles' });
    expect(canSaveEdit(original, f)).toBe(true);
  });

  it('is false when the value is present but the unit is missing', () => {
    const original = completion({ activity: 'running', value: null, unit: null });
    const f = form({ activity: 'running', value: '3', unit: null });
    expect(canSaveEdit(original, f)).toBe(false);
  });
});
