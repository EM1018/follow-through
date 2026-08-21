/**
 * "Skeleton shows only on an empty cache" -- hasCache means the query has
 * returned at least once (query.data !== undefined), regardless of whether
 * that response held any goals. A present cache always wins over a loading
 * flag, so a background refetch never brings the skeleton back.
 */
export function shouldShowSkeleton(hasCache: boolean, delayedLoading: boolean): boolean {
  return !hasCache && delayedLoading;
}

/**
 * Empty renders only once the call has actually returned zero goals, and
 * never while any request (initial or a background refetch) is in flight --
 * a refetch that might restore cached-but-now-stale content must not flash
 * empty first.
 */
export function shouldShowEmptyState(hasCache: boolean, totalCount: number, isFetching: boolean): boolean {
  return hasCache && totalCount === 0 && !isFetching;
}
