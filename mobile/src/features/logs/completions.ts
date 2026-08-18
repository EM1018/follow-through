import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { components } from '@/api/schema';

import type { DateRange } from './window';

export type CompletionRead = components['schemas']['CompletionRead'];

/** The only module that talks to the API for the log feature. */
export function listCompletions(range: DateRange): Promise<CompletionRead[]> {
  return unwrap(api.GET('/completions', { params: { query: range } }));
}

export function deleteCompletion(id: string): Promise<void> {
  return unwrap(
    api.DELETE('/completions/{completion_id}', { params: { path: { completion_id: id } } }),
  );
}
