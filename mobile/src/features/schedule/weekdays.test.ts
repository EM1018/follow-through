import { addDays, getISODay, startOfWeek } from 'date-fns';

// Never use Date.getDay() (0=Sunday..6=Saturday) anywhere in this feature --
// the backend uses ISO weekdays (1=Monday..7=Sunday), and getISODay() is
// what lines the two up.
describe('getISODay', () => {
  it('maps a known Monday to 1', () => {
    const monday = startOfWeek(new Date(2026, 0, 1), { weekStartsOn: 1 });
    expect(getISODay(monday)).toBe(1);
  });

  it('maps a known Sunday to 7', () => {
    const monday = startOfWeek(new Date(2026, 0, 1), { weekStartsOn: 1 });
    const sunday = addDays(monday, 6);
    expect(getISODay(sunday)).toBe(7);
  });
});
