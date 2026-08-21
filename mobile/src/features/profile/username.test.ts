import { isValidUsernameFormat, lowercaseUsername } from './username';

describe('lowercaseUsername', () => {
  it('lowercases as typed', () => {
    expect(lowercaseUsername('Jordan_R')).toBe('jordan_r');
  });
});

describe('isValidUsernameFormat', () => {
  it('accepts letters, numbers, and underscores between 3 and 20 characters', () => {
    expect(isValidUsernameFormat('sam')).toBe(true);
    expect(isValidUsernameFormat('jordan_r')).toBe(true);
    expect(isValidUsernameFormat('a'.repeat(20))).toBe(true);
  });

  it('rejects a name shorter than 3 characters', () => {
    expect(isValidUsernameFormat('ab')).toBe(false);
  });

  it('rejects a name with a hyphen', () => {
    expect(isValidUsernameFormat('jordan-r')).toBe(false);
  });

  it('rejects a name with a space', () => {
    expect(isValidUsernameFormat('jordan r')).toBe(false);
  });

  it('rejects a name longer than 20 characters', () => {
    expect(isValidUsernameFormat('a'.repeat(21))).toBe(false);
  });

  it('rejects uppercase input -- the field lowercases before this ever runs, but the check itself must not silently accept it', () => {
    expect(isValidUsernameFormat('Sam')).toBe(false);
  });
});
