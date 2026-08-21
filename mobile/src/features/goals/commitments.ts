import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';

export type CommitmentRead = components['schemas']['CommitmentRead'];
export type CommitmentCreate = components['schemas']['CommitmentCreate'];
export type CommitmentsListResponse = components['schemas']['CommitmentsListResponse'];
export type ProgressRead = components['schemas']['ProgressRead'];
export type BlockRead = components['schemas']['BlockRead'];
export type BlockStatus = components['schemas']['BlockStatus'];

/** The Goals tab's one query -- the whole screen is driven by this single cache entry. */
export const COMMITMENTS_QUERY_KEY = ['commitments'] as const;

export function listCommitments(): Promise<CommitmentsListResponse> {
  return unwrap(api.GET('/commitments'));
}

export function createCommitment(payload: CommitmentCreate): Promise<CommitmentRead> {
  return unwrap(api.POST('/commitments', { body: payload }));
}

export function useCommitments() {
  return useQuery<CommitmentsListResponse, ApiError>({
    queryKey: COMMITMENTS_QUERY_KEY,
    queryFn: listCommitments,
  });
}

/**
 * A commitment's progress is computed server-side from every completion that
 * matches its activity/target -- there's no client-held copy of that link,
 * so any completion write anywhere (Log tab create/edit/delete, the
 * schedule's tap-to-log/unlog, its "add amount" edit sheet) can change what a
 * goal's blocks show. Every one of those write paths calls this, the same
 * way they already call invalidateCompletionsQueries/invalidateAllScheduleQueries
 * so the Log tab and schedule don't go stale from each other's writes.
 */
export function invalidateCommitmentsQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: COMMITMENTS_QUERY_KEY });
}
