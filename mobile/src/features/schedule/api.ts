import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';
import { formatDateOnly } from '@/lib/dates';

export type ScheduleResponse = components['schemas']['ScheduleResponse'];
export type DaySchedule = components['schemas']['DayScheduleRead'];
export type ResolvedEntry = components['schemas']['ResolvedEntryRead'];
export type EntryRef = components['schemas']['EntryRefRead'];

/** Shared between useSchedule and queryClient.prefetchQuery so both always hit the same cache entry. */
export function scheduleQueryOptions(planId: string, from: Date, to: Date) {
  const fromParam = formatDateOnly(from);
  const toParam = formatDateOnly(to);

  return {
    queryKey: ['plans', planId, 'schedule', fromParam, toParam] as const,
    queryFn: () =>
      unwrap(
        api.GET('/plans/{plan_id}/schedule', {
          params: { path: { plan_id: planId }, query: { from: fromParam, to: toParam } },
        }),
      ),
  };
}

export function useSchedule(planId: string, from: Date, to: Date) {
  return useQuery<ScheduleResponse, ApiError>(scheduleQueryOptions(planId, from, to));
}
