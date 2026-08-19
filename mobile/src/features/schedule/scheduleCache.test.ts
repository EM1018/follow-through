import {
  applyOptimisticCancel,
  applyOptimisticCompletion,
  dayCompletedFor,
  dayStatusFor,
  type DaySchedule,
  type ScheduleResponse,
} from './scheduleCache';

function makeResolvedEntry(entryId: string, overrides: Partial<DaySchedule['entries'][number]> = {}) {
  return {
    entry_id: entryId,
    name: 'Legs',
    notes: null,
    replaced: null,
    status: 'scheduled' as const,
    workout_id: 'w1',
    completion_id: null,
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
        [dateParam]: {
          status: 'scheduled',
          entries: [makeResolvedEntry('root', { name: 'Legs' })],
          cancelled: [],
          completed: false,
        },
      },
    };

    const next = applyOptimisticCancel(response, dateParam, 'root', 'Legs');

    expect(next.days[dateParam]).toEqual({
      status: 'cancelled',
      entries: [],
      cancelled: [{ entry_id: 'root', name: 'Legs' }],
      completed: false,
    });
  });

  it('leaves other dates in the response untouched', () => {
    const other: DaySchedule = {
      status: 'scheduled',
      entries: [makeResolvedEntry('other')],
      cancelled: [],
      completed: false,
    };
    const response: ScheduleResponse = {
      days: {
        [dateParam]: {
          status: 'scheduled',
          entries: [makeResolvedEntry('root')],
          cancelled: [],
          completed: false,
        },
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
          completed: false,
        },
      },
    };

    const next = applyOptimisticCancel(response, dateParam, 'root', 'Legs');

    expect(next.days[dateParam].status).toBe('scheduled');
    expect(next.days[dateParam].entries).toEqual([makeResolvedEntry('sibling', { name: 'Arms' })]);
  });
});

describe('dayCompletedFor', () => {
  it('is false for zero entries -- vacuous truth guard, matching the backend', () => {
    expect(dayCompletedFor([])).toBe(false);
  });

  it('is false when one of several entries has no completion', () => {
    const entries = [
      makeResolvedEntry('a', { completion_id: 'c1' }),
      makeResolvedEntry('b', { completion_id: null }),
    ];
    expect(dayCompletedFor(entries)).toBe(false);
  });

  it('is true when every entry has a completion', () => {
    const entries = [
      makeResolvedEntry('a', { completion_id: 'c1' }),
      makeResolvedEntry('b', { completion_id: 'c2' }),
    ];
    expect(dayCompletedFor(entries)).toBe(true);
  });
});

describe('applyOptimisticCompletion', () => {
  const dateParam = '2026-08-18';

  it('sets completion_id on the target entry and recomputes completed', () => {
    const response: ScheduleResponse = {
      days: {
        [dateParam]: {
          status: 'scheduled',
          entries: [makeResolvedEntry('root')],
          cancelled: [],
          completed: false,
        },
      },
    };

    const next = applyOptimisticCompletion(response, dateParam, 'root', 'c1');

    expect(next.days[dateParam].entries).toEqual([makeResolvedEntry('root', { completion_id: 'c1' })]);
    expect(next.days[dateParam].completed).toBe(true);
  });

  it('clears completion_id back to null (unlog) and recomputes completed', () => {
    const response: ScheduleResponse = {
      days: {
        [dateParam]: {
          status: 'scheduled',
          entries: [makeResolvedEntry('root', { completion_id: 'c1' })],
          cancelled: [],
          completed: true,
        },
      },
    };

    const next = applyOptimisticCompletion(response, dateParam, 'root', null);

    expect(next.days[dateParam].entries).toEqual([makeResolvedEntry('root', { completion_id: null })]);
    expect(next.days[dateParam].completed).toBe(false);
  });

  it('leaves a sibling entry, and the day status itself, untouched', () => {
    const response: ScheduleResponse = {
      days: {
        [dateParam]: {
          status: 'substituted',
          entries: [makeResolvedEntry('root'), makeResolvedEntry('sibling', { status: 'substituted' })],
          cancelled: [],
          completed: false,
        },
      },
    };

    const next = applyOptimisticCompletion(response, dateParam, 'root', 'c1');

    expect(next.days[dateParam].status).toBe('substituted');
    expect(next.days[dateParam].entries).toEqual([
      makeResolvedEntry('root', { completion_id: 'c1' }),
      makeResolvedEntry('sibling', { status: 'substituted' }),
    ]);
  });

  it('is a no-op when the response has no entry for that date', () => {
    const response: ScheduleResponse = { days: {} };
    expect(applyOptimisticCompletion(response, dateParam, 'root', 'c1')).toBe(response);
  });
});
