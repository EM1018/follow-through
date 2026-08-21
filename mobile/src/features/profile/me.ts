import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';

export type MeRead = components['schemas']['MeRead'];
export type MeUpdate = components['schemas']['MeUpdate'];

export const ME_QUERY_KEY = ['me'] as const;

export function getMe(): Promise<MeRead> {
  return unwrap(api.GET('/me'));
}

export function updateMe(patch: MeUpdate): Promise<MeRead> {
  return unwrap(api.PATCH('/me', { body: patch }));
}

export function useMe() {
  return useQuery<MeRead, ApiError>({ queryKey: ME_QUERY_KEY, queryFn: getMe });
}

export function invalidateMeQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}
