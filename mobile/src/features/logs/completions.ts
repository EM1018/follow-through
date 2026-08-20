import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';

import type { DateRange } from './window';

export type CompletionRead = components['schemas']['CompletionRead'];
export type CompletionCreate = components['schemas']['CompletionCreate'];
export type CompletionUpdate = components['schemas']['CompletionUpdate'];

/** The Log tab's list/graph query key -- shared so any mutation that touches
 * a completion, from either door (the Log tab or the schedule), invalidates
 * the same cache entry rather than each maintaining its own copy of this key.
 */
export const COMPLETIONS_QUERY_KEY = ['completions'] as const;

export function invalidateCompletionsQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: COMPLETIONS_QUERY_KEY });
}

/**
 * Whether deleting this completion can leave a stale filled circle behind on
 * the schedule -- true only for a still-entry-linked log. A standalone log,
 * or one whose entry was already deleted (schedule_entry_id nulled, source
 * still 'scheduled'), has nothing live on the schedule to invalidate.
 */
export function completionIsEntryLinked(completion: Pick<CompletionRead, 'schedule_entry_id'>): boolean {
  return completion.schedule_entry_id !== null;
}

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

/**
 * A single day's completions -- the schedule response only ever carries
 * `completion_id` (see ResolvedEntryRead: one recurring entry has completions
 * on many different dates, so it can't carry a single amount itself). This is
 * how a schedule row learns the amount/activity/note of what it logged, keyed
 * under the same 'completions' prefix so invalidateCompletionsQueries covers it too.
 */
export function useCompletionsForDate(dateParam: string) {
  return useQuery<CompletionRead[], ApiError>({
    queryKey: [...COMPLETIONS_QUERY_KEY, 'byDate', dateParam] as const,
    queryFn: () => listCompletions({ from: dateParam, to: dateParam }),
    // Supplementary, not load-bearing -- the circle and the row itself come
    // from the schedule query. If this one fails, the amount affordance just
    // doesn't appear rather than retrying aggressively for a "nice to have".
    retry: false,
  });
}
