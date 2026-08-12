import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { router } from 'expo-router';

import type { ApiError } from './errors';

/**
 * The app-wide 404 rule: a missing resource means "this is gone" everywhere, not
 * "something went wrong on this screen." Every detail query's onError should call
 * this instead of re-implementing the navigate-back + invalidate-parent dance.
 */
export function handleNotFound(error: ApiError, queryClient: QueryClient, parentListKey: QueryKey) {
  if (error.kind !== 'not_found') {
    return;
  }
  router.back();
  queryClient.invalidateQueries({ queryKey: parentListKey });
}
