import { format } from 'date-fns';

import { weekDates, weekStartFor } from './week';

describe('weekStartFor', () => {
  it('returns the same start for offset 0 as the week containing today', () => {
    const today = new Date(2026, 7, 12); // Wednesday, August 12 2026
    const start = weekStartFor(today, 0);
    expect(format(start, 'yyyy-MM-dd')).toBe('2026-08-09'); // preceding Sunday
  });

  it('advances by whole weeks for positive and negative offsets', () => {
    const today = new Date(2026, 7, 12);
    expect(format(weekStartFor(today, 1), 'yyyy-MM-dd')).toBe('2026-08-16');
    expect(format(weekStartFor(today, -1), 'yyyy-MM-dd')).toBe('2026-08-02');
  });
});

describe('weekDates', () => {
  it('produces 7 consecutive days starting from weekStart', () => {
    const start = new Date(2026, 7, 9); // Sunday, August 9 2026
    const dates = weekDates(start).map((d) => format(d, 'yyyy-MM-dd'));
    expect(dates).toEqual([
      '2026-08-09',
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
    ]);
  });

  it('advances correctly across a month boundary', () => {
    const aug31 = new Date(2026, 7, 31); // Monday, August 31 2026
    const start = weekStartFor(aug31, 0); // Sunday, August 30 2026
    const dates = weekDates(start).map((d) => format(d, 'yyyy-MM-dd'));
    expect(dates).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
  });
});
