import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { components } from '@/api/schema';

import type { DateRange } from './window';

export type CompletionRead = components['schemas']['CompletionRead'];
export type CompletionCreate = components['schemas']['CompletionCreate'];
export type CompletionUpdate = components['schemas']['CompletionUpdate'];

/** The only module that talks to the API for the log feature. */
export function listCompletions(range: DateRange): Promise<CompletionRead[]> {
  return unwrap(api.GET('/completions', { params: { query: range } }));
}

export function deleteCompletion(id: string): Promise<void> {
  return unwrap(
    api.DELETE('/completions/{completion_id}', { params: { path: { completion_id: id } } }),
  );
}

export function createCompletion(payload: CompletionCreate): Promise<CompletionRead> {
  return unwrap(api.POST('/completions', { body: payload }));
}

export function updateCompletion(id: string, patch: CompletionUpdate): Promise<CompletionRead> {
  return unwrap(
    api.PATCH('/completions/{completion_id}', {
      params: { path: { completion_id: id } },
      body: patch,
    }),
  );
}
