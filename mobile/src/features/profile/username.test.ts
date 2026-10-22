import { isValidUsernameFormat } from './username';

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

  it('accepts uppercase and mixed case -- the backend keeps capitals as typed', () => {
    expect(isValidUsernameFormat('Sam')).toBe(true);
    expect(isValidUsernameFormat('Jordan_R')).toBe(true);
    expect(isValidUsernameFormat('ABC')).toBe(true);
  });

  it('rejects letters outside A-Z, matching the backend pattern', () => {
    expect(isValidUsernameFormat('josé')).toBe(false);
  });
});
