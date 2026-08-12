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
    const detail = (body as components['schemas']['HTTPValidationError'] | undefined)?.detail ?? [];
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
  if (error !== undefined || data === undefined) {
    throw classifyApiError(response.status, error);
  }
  return data;
}
