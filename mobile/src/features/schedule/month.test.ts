import { format } from 'date-fns';

import { monthGrid, monthStartFor } from './month';

describe('monthStartFor', () => {
  it('returns the start of the month containing today for offset 0', () => {
    const today = new Date(2026, 7, 12); // August 12 2026
    expect(format(monthStartFor(today, 0), 'yyyy-MM-dd')).toBe('2026-08-01');
  });

  it('advances across a year boundary', () => {
    const today = new Date(2026, 11, 15); // December 15 2026
    expect(format(monthStartFor(today, 1), 'yyyy-MM-dd')).toBe('2027-01-01');
    expect(format(monthStartFor(today, -12), 'yyyy-MM-dd')).toBe('2025-12-01');
  });
});

describe('monthGrid', () => {
  it('pads leading and trailing days from adjacent months, marked out-of-month', () => {
    // August 2026: 1st is a Saturday, 31 days, last day is a Monday.
    const grid = monthGrid(new Date(2026, 7, 1));

    expect(grid).toHaveLength(42); // 6 full weeks
    expect(format(grid[0].date, 'yyyy-MM-dd')).toBe('2026-07-26');
    expect(grid[0].inMonth).toBe(false);
    expect(format(grid[grid.length - 1].date, 'yyyy-MM-dd')).toBe('2026-09-05');
    expect(grid[grid.length - 1].inMonth).toBe(false);

    const inMonthCount = grid.filter((cell) => cell.inMonth).length;
    expect(inMonthCount).toBe(31);
  });

  it('needs no padding when the month starts on a Sunday and divides evenly into weeks', () => {
    // February 2026: 1st is a Sunday, 28 days, last day is a Saturday.
    const grid = monthGrid(new Date(2026, 1, 1));

    expect(grid).toHaveLength(28);
    expect(grid.every((cell) => cell.inMonth)).toBe(true);
  });
});
