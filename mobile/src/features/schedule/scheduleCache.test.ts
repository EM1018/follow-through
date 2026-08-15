import { applyOptimisticCancel, dayStatusFor, type DaySchedule, type ScheduleResponse } from './scheduleCache';

function makeResolvedEntry(entryId: string, overrides: Partial<DaySchedule['entries'][number]> = {}) {
  return {
    entry_id: entryId,
    name: 'Legs',
    notes: null,
    replaced: null,
    status: 'scheduled' as const,
    workout_id: 'w1',
    ...overrides,
  };
}

describe('dayStatusFor', () => {
  it('is substituted when any surviving entry is substituted, regardless of others', () => {
    const entries = [makeResolvedEntry('a', { status: 'scheduled' }), makeResolvedEntry('b', { status: 'substituted' })];
    expect(dayStatusFor(entries, [])).toBe('substituted');
  });

  it('is scheduled when entries survive and none are substituted', () => {
    expect(dayStatusFor([makeResolvedEntry('a')], [])).toBe('scheduled');
  });

  it('is cancelled when no entries survive but something is cancelled', () => {
    expect(dayStatusFor([], [{ entry_id: 'root', name: 'Legs' }])).toBe('cancelled');
  });

  it('is empty when nothing survives and nothing is cancelled', () => {
    expect(dayStatusFor([], [])).toBe('empty');
  });
});

describe('applyOptimisticCancel', () => {
  const dateParam = '2026-08-18';

  it('moves the entry out of entries and into cancelled, recomputing status', () => {
    const response: ScheduleResponse = {
      days: {
        [dateParam]: { status: 'scheduled', entries: [makeResolvedEntry('root', { name: 'Legs' })], cancelled: [] },
      },
    };

    const next = applyOptimisticCancel(response, dateParam, 'root', 'Legs');

    expect(next.days[dateParam]).toEqual({
      status: 'cancelled',
      entries: [],
      cancelled: [{ entry_id: 'root', name: 'Legs' }],
    });
  });

  it('leaves other dates in the response untouched', () => {
    const other: DaySchedule = { status: 'scheduled', entries: [makeResolvedEntry('other')], cancelled: [] };
    const response: ScheduleResponse = {
      days: {
        [dateParam]: { status: 'scheduled', entries: [makeResolvedEntry('root')], cancelled: [] },
        '2026-08-19': other,
      },
    };

    const next = applyOptimisticCancel(response, dateParam, 'root', 'Legs');

    expect(next.days['2026-08-19']).toBe(other);
  });

  it('is a no-op when the response has no entry for that date', () => {
    const response: ScheduleResponse = { days: {} };
    expect(applyOptimisticCancel(response, dateParam, 'root', 'Legs')).toBe(response);
  });

  it('keeps a still-scheduled sibling entry, so the day stays scheduled rather than flipping to cancelled', () => {
    const response: ScheduleResponse = {
      days: {
        [dateParam]: {
          status: 'scheduled',
          entries: [makeResolvedEntry('root', { name: 'Legs' }), makeResolvedEntry('sibling', { name: 'Arms' })],
          cancelled: [],
        },
      },
    };

    const next = applyOptimisticCancel(response, dateParam, 'root', 'Legs');

    expect(next.days[dateParam].status).toBe('scheduled');
    expect(next.days[dateParam].entries).toEqual([makeResolvedEntry('sibling', { name: 'Arms' })]);
  });
});
