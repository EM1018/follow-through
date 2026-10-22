import type { ApiError } from '@/api/errors';
import { isValidUsernameFormat, USERNAME_FORMAT_ERROR } from '@/features/profile/username';

/**
 * Everything that can be wrong with "Send to", whichever side noticed it.
 * `username_required` is the odd one out: not a mistake in the field but a
 * gate on the sender -- a challenge card names who sent it, so a sender
 * with no username would hand the recipient a card they can't read.
 */
export type SendToProblem = 'format' | 'self' | 'not_found' | 'duplicate' | 'username_required';

/**
 * What can be known before sending, run on blur and again on Save -- never
 * per keystroke, since a half-typed username always looks wrong. `myUsername`
 * is undefined while /me is loading: the checks that need it are skipped
 * then, and the server's answer covers them.
 */
export function checkSendTo(sendTo: string, myUsername: string | null | undefined): SendToProblem | null {
  const name = sendTo.trim();
  if (name === '') {
    return null;
  }
  // First, as on the server: until the sender has a name, nothing else about the field matters.
  if (myUsername === null) {
    return 'username_required';
  }
  if (!isValidUsernameFormat(name)) {
    return 'format';
  }
  // Usernames match without regard to case on the server, so "Sam" is "sam".
  if (myUsername !== undefined && name.toLowerCase() === myUsername.toLowerCase()) {
    return 'self';
  }
  return null;
}

// The server sends the self-challenge 422 with a plain-string detail and no
// code -- this is the only thing that tells it apart from any other 422.
const SELF_CHALLENGE_DETAIL = 'You cannot challenge yourself';

/**
 * A failed send, if it's about the "Send to" field; null for anything else
 * (network, 5xx, ...), which the sheet shows as its general error instead.
 * POST /commitments only 404s on an unknown recipient.
 */
export function sendToProblemFromError(error: ApiError): SendToProblem | null {
  switch (error.kind) {
    case 'conflict':
      if (error.code === 'username_required') return 'username_required';
      if (error.code === 'duplicate_challenge') return 'duplicate';
      return null;
    case 'not_found':
      return 'not_found';
    case 'validation':
      return error.detail.some((d) => d.msg === SELF_CHALLENGE_DETAIL) ? 'self' : null;
    default:
      return null;
  }
}

/**
 * Inline copy under the field. `name` is the username as typed. The
 * duplicate rule is symmetric -- it blocks whether you or they sent the
 * existing one, running or still waiting on an answer -- so the copy says
 * "a challenge going with" and never who sent what.
 */
export function sendToMessage(problem: SendToProblem, name: string): string {
  switch (problem) {
    case 'format':
      return USERNAME_FORMAT_ERROR;
    case 'self':
      return "That's you. Send it to someone else.";
    case 'not_found':
      return `No one goes by ${name}.`;
    case 'duplicate':
      return `You already have a challenge going with ${name} for this activity.`;
    case 'username_required':
      return `Set your username first, so ${name} knows who the challenge is from.`;
  }
}

export const GO_TO_PROFILE_LABEL = 'Set username in Profile';
