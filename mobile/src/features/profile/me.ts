import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { classifyApiError, unwrap, type ApiError } from '@/api/errors';
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

/**
 * Same call as updateMe, but authorized with an access token handed to us
 * directly rather than one read back from storage via the shared `api`
 * client's middleware. Needed right after signUp(): persisting the new
 * session to storage is asynchronous, so a PATCH that reads it back could
 * fire with no Authorization header and come back 401.
 */
export async function updateMeWithToken(patch: MeUpdate, accessToken: string): Promise<MeRead> {
  let response: Response;
  try {
    response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(patch),
    });
  } catch {
    throw { kind: 'network' } satisfies ApiError;
  }

  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw classifyApiError(response.status, body);
  }
  return body as MeRead;
}

export function useMe() {
  return useQuery<MeRead, ApiError>({ queryKey: ME_QUERY_KEY, queryFn: getMe });
}

export function invalidateMeQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}
