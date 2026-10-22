/**
 * The backend's own pattern (schemas/user.py, ck_users_username_format).
 * Case is kept as typed -- "Jordan_R" is stored and shown that way -- and
 * uniqueness ignores case server-side, so "jordan_r" would come back 409.
 * Checked before submit so a 422 is only ever a fallback.
 */
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export function isValidUsernameFormat(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export const USERNAME_HELPER_TEXT =
  "Letters, numbers, and underscores. This is how friends will find you when challenges arrive.";

export const USERNAME_TAKEN_ERROR = 'That username is taken.';

export const USERNAME_FORMAT_ERROR = '3-20 characters: letters, numbers, underscores';
