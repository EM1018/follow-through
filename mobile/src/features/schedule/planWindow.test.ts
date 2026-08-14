import { planWindowState } from './planWindow';

describe('planWindowState', () => {
  const starts = new Date(2026, 7, 11); // August 11 2026
  const ends = new Date(2026, 7, 31); // August 31 2026

  it('is before for a date earlier than starts', () => {
    expect(planWindowState(new Date(2026, 7, 10), starts, ends)).toBe('before');
  });

  it('is within for a date exactly on starts (inclusive)', () => {
    expect(planWindowState(starts, starts, ends)).toBe('within');
  });

  it('is within for a date in the middle of the window', () => {
    expect(planWindowState(new Date(2026, 7, 20), starts, ends)).toBe('within');
  });

  it('is within for a date exactly on ends (inclusive)', () => {
    expect(planWindowState(ends, starts, ends)).toBe('within');
  });

  it('is after for a date later than ends', () => {
    expect(planWindowState(new Date(2026, 8, 1), starts, ends)).toBe('after');
  });

  it('is never after when ends is null, however far in the future', () => {
    expect(planWindowState(new Date(2030, 0, 1), starts, null)).toBe('within');
  });
});
