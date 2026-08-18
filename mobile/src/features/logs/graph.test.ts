import { buildGrid, level } from './graph';

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

// Monday, August 17 2026. The window's `from` (start of the week 7 weeks
// back) is Sunday, June 28 2026; the grid runs through Saturday, August 22.
const TODAY = new Date(2026, 7, 17);

describe('buildGrid', () => {
  it('places a known Sunday in column 0', () => {
    const grid = buildGrid([completion({ on_date: '2026-06-28' })], TODAY);
    expect(grid[0][0].date).toBe('2026-06-28');
  });

  it('places a known Monday in column 1', () => {
    const grid = buildGrid([completion({ on_date: '2026-08-17' })], TODAY);
    // Today (a Monday) falls in the grid's last row.
    expect(grid[7][1].date).toBe('2026-08-17');
  });

  it('is 8 rows of 7', () => {
    const grid = buildGrid([], TODAY);
    expect(grid).toHaveLength(8);
    grid.forEach((week) => expect(week).toHaveLength(7));
  });

  it('marks dates after today as future', () => {
    const grid = buildGrid([], TODAY);
    const flat = grid.flat();
    const future = flat.filter((cell) => cell.isFuture);
    expect(future.every((cell) => cell.date > '2026-08-17')).toBe(true);
    expect(future.some((cell) => cell.date === '2026-08-18')).toBe(true);
  });

  it('marks exactly one cell as today', () => {
    const grid = buildGrid([], TODAY);
    const todayCells = grid.flat().filter((cell) => cell.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].date).toBe('2026-08-17');
  });

  it('excludes rows older than the window', () => {
    const grid = buildGrid([completion({ on_date: '2026-01-01' })], TODAY);
    const totalCount = grid.flat().reduce((sum, cell) => sum + cell.count, 0);
    expect(totalCount).toBe(0);
  });

  it('counts rows within the window on their date', () => {
    const rows = [
      completion({ id: 'a', on_date: '2026-08-10' }),
      completion({ id: 'b', on_date: '2026-08-10' }),
    ];
    const grid = buildGrid(rows, TODAY);
    const cell = grid.flat().find((c) => c.date === '2026-08-10');
    expect(cell?.count).toBe(2);
  });
});

describe('level', () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [7, 3],
  ])('level(%i) is %i', (count, expected) => {
    expect(level(count)).toBe(expected);
  });
});

describe('filtering', () => {
  const rows = [
    completion({ id: 'run-1', on_date: '2026-08-10', activity: 'running' }),
    completion({ id: 'run-2', on_date: '2026-08-11', activity: 'running' }),
    completion({ id: 'swim-1', on_date: '2026-08-12', activity: 'swimming' }),
  ];

  it('produces a shorter list and a sparser grid than the unfiltered source', () => {
    const filtered = rows.filter((row) => row.activity === 'running');
    expect(filtered.length).toBeLessThan(rows.length);

    const fullGrid = buildGrid(rows, TODAY);
    const filteredGrid = buildGrid(filtered, TODAY);
    const fullTotal = fullGrid.flat().reduce((sum, cell) => sum + cell.count, 0);
    const filteredTotal = filteredGrid.flat().reduce((sum, cell) => sum + cell.count, 0);
    expect(filteredTotal).toBeLessThan(fullTotal);
  });
});
