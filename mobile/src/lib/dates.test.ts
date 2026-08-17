import { formatDateOnly, parseDateOnly } from './dates';

describe('date-only round trip', () => {
  it('parses a date-only string and formats it back to the same calendar day', () => {
    const original = '2026-08-11';
    expect(formatDateOnly(parseDateOnly(original))).toBe(original);
  });

  it('parses as local midnight, not UTC midnight', () => {
    const date = parseDateOnly('2026-08-11');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(11);
    expect(date.getHours()).toBe(0);
  });
});
