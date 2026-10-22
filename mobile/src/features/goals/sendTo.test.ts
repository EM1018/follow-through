import { checkSendTo, sendToMessage, sendToProblemFromError } from './sendTo';

describe('checkSendTo (on blur and on Save)', () => {
  it('has nothing to say about an empty field -- that is a goal', () => {
    expect(checkSendTo('', 'alex')).toBeNull();
    expect(checkSendTo('   ', null)).toBeNull();
  });

  it('gates on the sender having no username before anything else', () => {
    expect(checkSendTo('not valid!', null)).toBe('username_required');
  });

  it('flags a malformed name', () => {
    expect(checkSendTo('ab', 'alex')).toBe('format');
    expect(checkSendTo('sam-r', 'alex')).toBe('format');
  });

  it('flags yourself, ignoring case', () => {
    expect(checkSendTo('Alex', 'alex')).toBe('self');
    expect(checkSendTo(' ALEX ', 'Alex')).toBe('self');
  });

  it('accepts a well-formed name that is someone else', () => {
    expect(checkSendTo('Sam_R', 'alex')).toBeNull();
  });

  it('skips the checks that need /me while it is still loading, leaving them to the server', () => {
    expect(checkSendTo('alex', undefined)).toBeNull();
    expect(checkSendTo('ab', undefined)).toBe('format');
  });
});

describe('sendToProblemFromError (after a failed send)', () => {
  it('maps each recipient-related failure the server can send', () => {
    expect(sendToProblemFromError({ kind: 'not_found' })).toBe('not_found');
    expect(sendToProblemFromError({ kind: 'conflict', code: 'duplicate_challenge' })).toBe('duplicate');
    expect(sendToProblemFromError({ kind: 'conflict', code: 'username_required' })).toBe('username_required');
    expect(
      sendToProblemFromError({
        kind: 'validation',
        detail: [{ loc: [], msg: 'You cannot challenge yourself', type: 'value_error' }],
      }),
    ).toBe('self');
  });

  it("leaves anything that isn't about the recipient to the sheet's general error", () => {
    expect(sendToProblemFromError({ kind: 'network' })).toBeNull();
    expect(sendToProblemFromError({ kind: 'server', status: 500 })).toBeNull();
    expect(sendToProblemFromError({ kind: 'conflict' })).toBeNull();
    expect(
      sendToProblemFromError({ kind: 'validation', detail: [{ loc: [], msg: 'something else', type: 'value_error' }] }),
    ).toBeNull();
  });
});

describe('sendToMessage', () => {
  it('names the username as typed', () => {
    expect(sendToMessage('not_found', 'Sam')).toBe('No one goes by Sam.');
    expect(sendToMessage('duplicate', 'Sam')).toBe('You already have a challenge going with Sam for this activity.');
    expect(sendToMessage('username_required', 'Sam')).toBe(
      'Set your username first, so Sam knows who the challenge is from.',
    );
  });

  it('has fixed copy for self and format', () => {
    expect(sendToMessage('self', 'Alex')).toBe("That's you. Send it to someone else.");
    expect(sendToMessage('format', 'ab')).toBe('3-20 characters: letters, numbers, underscores');
  });
});
