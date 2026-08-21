import { finishedWeekLabel, goalTermsLine, sessionsPerWeekLabel, streakLabel } from './goalTerms';

describe('sessionsPerWeekLabel', () => {
  it('renders "Every day" for 7, in the compact (card) style', () => {
    expect(sessionsPerWeekLabel(7, 'compact')).toBe('Every day');
  });

  it('renders "Every day" for 7, in the picker style', () => {
    expect(sessionsPerWeekLabel(7, 'picker')).toBe('Every day');
  });

  it('renders the compact form for any other count', () => {
    expect(sessionsPerWeekLabel(2, 'compact')).toBe('2×/wk');
  });

  it('renders the picker form for any other count', () => {
    expect(sessionsPerWeekLabel(2, 'picker')).toBe('2 × per week');
  });
});

describe('goalTermsLine', () => {
  it('includes the amount when a target is set', () => {
    const line = goalTermsLine({ target_value: 2, target_unit: 'miles', sessions_per_week: 2 });
    expect(line).toBe('2 mi · 2×/wk');
  });

  it('renders terms without an amount for a goal with no target', () => {
    const line = goalTermsLine({ target_value: null, target_unit: null, sessions_per_week: 2 });
    expect(line).toBe('2×/wk');
  });

  it('uses "Every day" in the terms line at 7 sessions a week', () => {
    const line = goalTermsLine({ target_value: null, target_unit: null, sessions_per_week: 7 });
    expect(line).toBe('Every day');
  });
});

describe('finishedWeekLabel', () => {
  it('reads as fully elapsed -- N of N', () => {
    expect(finishedWeekLabel(6)).toBe('Week 6 of 6');
  });
});

describe('streakLabel', () => {
  it('keeps "week" singular regardless of count', () => {
    expect(streakLabel(2)).toBe('2 week streak');
    expect(streakLabel(0)).toBe('0 week streak');
    expect(streakLabel(1)).toBe('1 week streak');
  });
});
