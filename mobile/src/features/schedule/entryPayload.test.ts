import { buildEntryPayloads, cancellationPayload, replacementPayload } from './entryPayload';

const WORKOUT_ID = 'workout-1';

describe('buildEntryPayloads', () => {
  it('produces a single on_date payload with no bounds when repeat is off', () => {
    const payloads = buildEntryPayloads(WORKOUT_ID, {
      repeat: false,
      date: new Date(2026, 7, 13),
      selectedWeekdays: [1, 3, 5], // ignored when repeat is off
      startingOn: new Date(2026, 7, 1),
      endingOn: new Date(2026, 7, 20),
    });

    expect(payloads).toEqual([{ workout_id: WORKOUT_ID, on_date: '2026-08-13' }]);
  });

  it('never sets day_of_week alongside on_date, or vice versa', () => {
    const oneOff = buildEntryPayloads(WORKOUT_ID, {
      repeat: false,
      date: new Date(2026, 7, 13),
      selectedWeekdays: [1],
      startingOn: new Date(2026, 7, 1),
      endingOn: null,
    });
    expect(oneOff[0]).not.toHaveProperty('day_of_week');
    expect(oneOff[0]).not.toHaveProperty('starts_on');
    expect(oneOff[0]).not.toHaveProperty('ends_on');

    const recurring = buildEntryPayloads(WORKOUT_ID, {
      repeat: true,
      date: new Date(2026, 7, 13),
      selectedWeekdays: [1],
      startingOn: new Date(2026, 7, 1),
      endingOn: null,
    });
    expect(recurring[0]).not.toHaveProperty('on_date');
  });

  it('produces one day_of_week payload per selected weekday, bounded by starts_on, when repeat is on', () => {
    const payloads = buildEntryPayloads(WORKOUT_ID, {
      repeat: true,
      date: new Date(2026, 7, 13),
      selectedWeekdays: [1, 3, 5],
      startingOn: new Date(2026, 7, 1),
      endingOn: null,
    });

    expect(payloads).toEqual([
      { workout_id: WORKOUT_ID, day_of_week: 1, starts_on: '2026-08-01' },
      { workout_id: WORKOUT_ID, day_of_week: 3, starts_on: '2026-08-01' },
      { workout_id: WORKOUT_ID, day_of_week: 5, starts_on: '2026-08-01' },
    ]);
  });

  it('includes ends_on only when an end date is set', () => {
    const withEnd = buildEntryPayloads(WORKOUT_ID, {
      repeat: true,
      date: new Date(2026, 7, 13),
      selectedWeekdays: [2],
      startingOn: new Date(2026, 7, 1),
      endingOn: new Date(2026, 7, 31),
    });
    expect(withEnd[0]).toEqual({
      workout_id: WORKOUT_ID,
      day_of_week: 2,
      starts_on: '2026-08-01',
      ends_on: '2026-08-31',
    });

    const withoutEnd = buildEntryPayloads(WORKOUT_ID, {
      repeat: true,
      date: new Date(2026, 7, 13),
      selectedWeekdays: [2],
      startingOn: new Date(2026, 7, 1),
      endingOn: null,
    });
    expect(withoutEnd[0]).not.toHaveProperty('ends_on');
  });
});

describe('cancellationPayload', () => {
  it('is dated, points at the root, and carries no workout, name_override, or bounds', () => {
    const payload = cancellationPayload('root-1', '2026-08-18');

    expect(payload).toEqual({ on_date: '2026-08-18', replaces_entry_id: 'root-1' });
    expect(payload).not.toHaveProperty('day_of_week');
    expect(payload).not.toHaveProperty('starts_on');
    expect(payload).not.toHaveProperty('ends_on');
    expect(payload).not.toHaveProperty('workout_id');
    expect(payload).not.toHaveProperty('name_override');
  });
});

describe('replacementPayload', () => {
  it('is dated, points at the root, carries the workout, and no name_override or bounds', () => {
    const payload = replacementPayload('root-1', '2026-08-18', 'workout-1');

    expect(payload).toEqual({ on_date: '2026-08-18', replaces_entry_id: 'root-1', workout_id: 'workout-1' });
    expect(payload).not.toHaveProperty('day_of_week');
    expect(payload).not.toHaveProperty('starts_on');
    expect(payload).not.toHaveProperty('ends_on');
    expect(payload).not.toHaveProperty('name_override');
  });
});
