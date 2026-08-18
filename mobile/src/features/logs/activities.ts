import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';

import type { CompletionRead } from './completions';

export type Activity = components['schemas']['Activity'];
export type ActivityInfo = components['schemas']['ActivityInfo'];
export type Dimension = components['schemas']['Dimension'];
export type UnitInfo = components['schemas']['UnitInfo'];
export type ActivitiesResponse = components['schemas']['ActivitiesResponse'];

/** Near-static vocabulary -- fetched once and cached, never refetched to filter. */
export function useActivities() {
  return useQuery<ActivitiesResponse, ApiError>({
    queryKey: ['activities'] as const,
    queryFn: () => unwrap(api.GET('/activities')),
    staleTime: Infinity,
  });
}

/**
 * Chips are built from activities actually present in the loaded rows, never
 * the full vocabulary -- a chip that filters to nothing shouldn't exist.
 * Ordering follows the response's own order, not insertion order in `rows`.
 */
export function presentActivities(rows: CompletionRead[], allActivities: ActivityInfo[]): ActivityInfo[] {
  const present = new Set(
    rows.map((row) => row.activity).filter((activity): activity is Activity => activity !== null),
  );
  return allActivities.filter((info) => present.has(info.activity));
}
