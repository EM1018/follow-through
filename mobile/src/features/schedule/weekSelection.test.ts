import { selectedDateForWeek } from './weekSelection';

// Sunday Aug 9 2026 through Saturday Aug 15 2026, in the same Sun-start
// column order weekDates() produces.
const weekDates = [
  new Date(2026, 7, 9),
  new Date(2026, 7, 10),
  new Date(2026, 7, 11),
  new Date(2026, 7, 12),
  new Date(2026, 7, 13),
  new Date(2026, 7, 14),
  new Date(2026, 7, 15),
];

describe('selectedDateForWeek', () => {
  it('selects today when today falls inside the visible week', () => {
    const today = new Date(2026, 7, 12); // Wednesday, mid-week
    const selected = selectedDateForWeek(weekDates, today, new Date(2020, 0, 1), null);
    expect(selected).toEqual(today);
  });

  it('selects today even when that day is out of the plan window', () => {
    const today = new Date(2026, 7, 10); // in the week, but before the plan starts
    const planStartsOn = new Date(2026, 7, 12);
    const selected = selectedDateForWeek(weekDates, today, planStartsOn, null);
    expect(selected).toEqual(today);
  });

  it('selects the week\'s first in-plan day when today is outside the week', () => {
    const today = new Date(2026, 8, 1); // a different week entirely
    const planStartsOn = new Date(2020, 0, 1);
    const selected = selectedDateForWeek(weekDates, today, planStartsOn, null);
    expect(selected).toEqual(weekDates[0]);
  });

  it('selects the first day of the week when the whole week is before the plan window', () => {
    const today = new Date(2026, 8, 1);
    const planStartsOn = new Date(2026, 8, 1); // starts after this entire week
    const selected = selectedDateForWeek(weekDates, today, planStartsOn, null);
    expect(selected).toEqual(weekDates[0]);
  });

  it('selects the first day of the week when the whole week is after the plan window', () => {
    const today = new Date(2026, 8, 1);
    const planStartsOn = new Date(2020, 0, 1);
    const planEndsOn = new Date(2026, 6, 1); // ended before this week starts
    const selected = selectedDateForWeek(weekDates, today, planStartsOn, planEndsOn);
    expect(selected).toEqual(weekDates[0]);
  });

  it('selects the plan start day when the week straddles the plan start boundary', () => {
    const today = new Date(2026, 8, 1); // outside the week
    const planStartsOn = new Date(2026, 7, 12); // Wednesday -- mid-week
    const selected = selectedDateForWeek(weekDates, today, planStartsOn, null);
    expect(selected).toEqual(planStartsOn);
  });
});
