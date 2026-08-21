const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

/** Lowercased as it's typed -- the API normalizes anyway, but the user
 * should see what they're actually claiming, not a mixed-case preview. */
export function lowercaseUsername(input: string): string {
  return input.toLowerCase();
}

export function isValidUsernameFormat(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export const USERNAME_HELPER_TEXT =
  "Letters, numbers, and underscores. This is how friends will find you when challenges arrive.";

export const USERNAME_TAKEN_ERROR = 'That username is taken.';
