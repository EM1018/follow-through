import { classifyApiError, describeApiError } from './errors';

describe('classifyApiError / describeApiError for 422s', () => {
  it('handles a pydantic-style array detail', () => {
    const error = classifyApiError(422, { detail: [{ loc: ['body', 'name'], msg: 'field required', type: 'missing' }] });
    expect(error).toEqual({
      kind: 'validation',
      detail: [{ loc: ['body', 'name'], msg: 'field required', type: 'missing' }],
    });
    expect(describeApiError(error)).toBe('field required');
  });

  it('handles a plain-string detail from a manually raised HTTPException, without crashing', () => {
    const error = classifyApiError(422, { detail: "on_date must fall within the plan's own window" });
    expect(() => describeApiError(error)).not.toThrow();
    expect(describeApiError(error)).toBe("on_date must fall within the plan's own window");
  });

  it('falls back to an empty list when detail is missing entirely', () => {
    const error = classifyApiError(422, {});
    expect(describeApiError(error)).toBe('Invalid request.');
  });
});

describe('classifyApiError error codes', () => {
  it("keeps a 409's detail.code so distinct conflicts can be told apart", () => {
    expect(classifyApiError(409, { detail: { code: 'challenge_cap_reached', message: 'x' } })).toEqual({
      kind: 'conflict',
      code: 'challenge_cap_reached',
    });
  });

  it("keeps a 404's detail.code", () => {
    expect(classifyApiError(404, { detail: { code: 'invite_unavailable', message: 'x' } })).toEqual({
      kind: 'not_found',
      code: 'invite_unavailable',
    });
  });

  it('leaves code off for a plain-string detail', () => {
    expect(classifyApiError(404, { detail: 'Commitment not found' })).toEqual({ kind: 'not_found' });
  });
});

describe('classifyApiError for 409s', () => {
  it('classifies as conflict, not server', () => {
    const error = classifyApiError(409, { detail: 'A completion already exists for this entry on this date' });
    expect(error).toEqual({ kind: 'conflict' });
  });

  it('describes without throwing', () => {
    expect(() => describeApiError({ kind: 'conflict' })).not.toThrow();
  });
});
