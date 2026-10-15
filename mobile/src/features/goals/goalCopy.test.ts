import { challengeThemLabel, endedEarlyLine } from './goalCopy';

describe('challengeThemLabel', () => {
  it("uses the other participant's username", () => {
    expect(challengeThemLabel('sam')).toBe('sam');
  });

  it('falls back to "Friend" when they have since cleared their username', () => {
    expect(challengeThemLabel(null)).toBe('Friend');
  });
});

describe('endedEarlyLine', () => {
  it('says you ended it when ended_by is you', () => {
    expect(endedEarlyLine({ id: 'c1', ended_by: 'you', ended_on: '2026-09-14' }, 'sam')).toBe(
      'You ended this on Sep 14',
    );
  });

  it('names the other participant when ended_by is them', () => {
    expect(endedEarlyLine({ id: 'c1', ended_by: 'them', ended_on: '2026-09-14' }, 'sam')).toBe(
      'sam ended this on Sep 14',
    );
  });

  it('says you ended it on a goal, which has no other participant', () => {
    expect(endedEarlyLine({ id: 'g1', ended_by: 'you', ended_on: '2026-09-14' }, null)).toBe(
      'You ended this on Sep 14',
    );
  });

  it('throws when a goal says them ended it -- a goal has no them', () => {
    expect(() => endedEarlyLine({ id: 'g1', ended_by: 'them', ended_on: '2026-09-14' }, null)).toThrow('g1');
  });

  it('throws when an ended_early row arrives without ended_by', () => {
    expect(() => endedEarlyLine({ id: 'c1', ended_on: '2026-09-14' }, 'sam')).toThrow('c1');
  });

  it('throws when an ended_early row arrives without ended_on', () => {
    expect(() => endedEarlyLine({ id: 'c1', ended_by: 'them' }, 'sam')).toThrow('c1');
  });
});
