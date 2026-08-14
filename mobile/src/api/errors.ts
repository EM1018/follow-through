import type { components } from './schema';

export type ValidationErrorDetail = components['schemas']['ValidationError'];

export type ApiError =
  | { kind: 'unauthorized' }
  | { kind: 'not_found' }
  | { kind: 'validation'; detail: ValidationErrorDetail[] }
  | { kind: 'server'; status: number }
  | { kind: 'network' };

export function classifyApiError(status: number, body: unknown): ApiError {
  if (status === 401) {
    return { kind: 'unauthorized' };
  }
  if (status === 404) {
    return { kind: 'not_found' };
  }
  if (status === 422) {
    // FastAPI's 422s come in two shapes: pydantic validation failures give
    // `detail` as a list of ValidationError objects, but a manually raised
    // `HTTPException(422, detail="...")` (e.g. the plan-window checks) gives
    // a plain string. Normalize both into the same list shape.
    const rawDetail = (body as { detail?: unknown } | undefined)?.detail;
    const detail: ValidationErrorDetail[] = Array.isArray(rawDetail)
      ? rawDetail
      : typeof rawDetail === 'string'
        ? [{ loc: [], msg: rawDetail, type: 'value_error' }]
        : [];
    return { kind: 'validation', detail };
  }
  return { kind: 'server', status };
}

/** Every response from a fetch that didn't throw before reaching the server lands here. */
export async function unwrap<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await request;
  } catch {
    throw { kind: 'network' } satisfies ApiError;
  }

  const { data, error, response } = result;
  // 204 responses (e.g. DELETE) are ok with no body -- don't treat that as an error.
  if (!response.ok) {
    throw classifyApiError(response.status, error);
  }
  return data as T;
}

export function describeApiError(error: ApiError): string {
  switch (error.kind) {
    case 'unauthorized':
      return 'You need to sign in again.';
    case 'not_found':
      return 'That no longer exists.';
    case 'validation':
      return error.detail.map((d) => d.msg).join('\n') || 'Invalid request.';
    case 'server':
      return `Server error (${error.status}).`;
    case 'network':
      return 'Network error -- check your connection and the API base URL.';
  }
}
