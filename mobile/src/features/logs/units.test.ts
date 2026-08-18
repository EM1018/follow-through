import { formatAmount } from './units';

describe('formatAmount', () => {
  it('returns null when value is null', () => {
    expect(formatAmount(null, 'miles')).toBeNull();
  });

  it('returns null when unit is null', () => {
    expect(formatAmount(5, null)).toBeNull();
  });

  it('returns null when both are null', () => {
    expect(formatAmount(null, null)).toBeNull();
  });

  it('formats an integer with no trailing decimal', () => {
    expect(formatAmount(10, 'minutes')).toBe('10 min');
  });

  it('formats a decimal', () => {
    expect(formatAmount(3.1, 'miles')).toBe('3.1 mi');
  });

  it('rounds to at most two decimal places and strips trailing zeros', () => {
    expect(formatAmount(3.14159, 'kilometers')).toBe('3.14 km');
    expect(formatAmount(3.1, 'kilometers')).toBe('3.1 km');
  });

  it('pluralizes sets against the value', () => {
    expect(formatAmount(1, 'sets')).toBe('1 set');
    expect(formatAmount(3, 'sets')).toBe('3 sets');
  });

  it('pluralizes reps against the value', () => {
    expect(formatAmount(1, 'reps')).toBe('1 rep');
    expect(formatAmount(3, 'reps')).toBe('3 reps');
  });
});
