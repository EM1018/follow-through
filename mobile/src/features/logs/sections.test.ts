import { groupByDate, sectionLabel } from './sections';

import type { CompletionRead } from './completions';

function completion(overrides: Partial<CompletionRead>): CompletionRead {
  return {
    activity: null,
    created_at: '2026-08-10T12:00:00Z',
    id: 'c1',
    label: 'Run',
    note: null,
    on_date: '2026-08-10',
    schedule_entry_id: null,
    source: 'standalone',
    unit: null,
    value: null,
    ...overrides,
  };
}

describe('sectionLabel', () => {
  const today = new Date(2026, 7, 17);

  it('labels today', () => {
    expect(sectionLabel('2026-08-17', today)).toBe('Today');
  });

  it('labels yesterday', () => {
    expect(sectionLabel('2026-08-16', today)).toBe('Yesterday');
  });

  it('labels an older date with the full weekday and date', () => {
    expect(sectionLabel('2026-08-10', today)).toBe('Monday, August 10');
  });
});

describe('groupByDate', () => {
  it('groups multiple rows on the same date into one section', () => {
    const rows = [
      completion({ id: 'a', on_date: '2026-08-10', created_at: '2026-08-10T09:00:00Z' }),
      completion({ id: 'b', on_date: '2026-08-10', created_at: '2026-08-10T10:00:00Z' }),
    ];
    const sections = groupByDate(rows);
    expect(sections).toHaveLength(1);
    expect(sections[0].date).toBe('2026-08-10');
    expect(sections[0].rows).toHaveLength(2);
  });

  it('orders rows within a date by created_at descending', () => {
    const rows = [
      completion({ id: 'earlier', on_date: '2026-08-10', created_at: '2026-08-10T09:00:00Z' }),
      completion({ id: 'later', on_date: '2026-08-10', created_at: '2026-08-10T15:00:00Z' }),
    ];
    const sections = groupByDate(rows);
    expect(sections[0].rows.map((r) => r.id)).toEqual(['later', 'earlier']);
  });

  it('orders sections across dates by on_date descending', () => {
    const rows = [
      completion({ id: 'old', on_date: '2026-08-01' }),
      completion({ id: 'new', on_date: '2026-08-15' }),
      completion({ id: 'mid', on_date: '2026-08-08' }),
    ];
    const sections = groupByDate(rows);
    expect(sections.map((s) => s.date)).toEqual(['2026-08-15', '2026-08-08', '2026-08-01']);
  });
});
