import { useQuery, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api/client';
import { unwrap, type ApiError } from '@/api/errors';
import type { components } from '@/api/schema';
import { formatDateOnly } from '@/lib/dates';

export type ScheduleResponse = components['schemas']['ScheduleResponse'];
export type DaySchedule = components['schemas']['DayScheduleRead'];
export type ResolvedEntry = components['schemas']['ResolvedEntryRead'];
export type EntryRef = components['schemas']['EntryRefRead'];
export type WorkoutRead = components['schemas']['WorkoutRead'];
export type WorkoutUpdate = components['schemas']['WorkoutUpdate'];
export type ScheduleEntryRead = components['schemas']['ScheduleEntryRead'];

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

/** Shared between the workouts screen and the entry actions sheet -- both need the full, unpaginated list. */
export function workoutsQueryOptions(planId: string) {
  return {
    queryKey: ['plans', planId, 'workouts'] as const,
    queryFn: () => unwrap(api.GET('/plans/{plan_id}/workouts', { params: { path: { plan_id: planId } } })),
  };
}

export function useWorkouts(planId: string) {
  return useQuery<WorkoutRead[], ApiError>(workoutsQueryOptions(planId));
}

export function scheduleEntriesQueryOptions(planId: string) {
  return {
    queryKey: ['plans', planId, 'schedule-entries'] as const,
    queryFn: () =>
      unwrap(api.GET('/plans/{plan_id}/schedule-entries', { params: { path: { plan_id: planId } } })),
  };
}

export function useScheduleEntries(planId: string) {
  return useQuery<ScheduleEntryRead[], ApiError>(scheduleEntriesQueryOptions(planId));
}

/** Every cache a workout/entry delete can affect -- all schedule ranges plus the two list queries. */
export function invalidatePlanScheduleData(queryClient: QueryClient, planId: string) {
  queryClient.invalidateQueries({ queryKey: ['plans', planId, 'schedule'] });
  queryClient.invalidateQueries({ queryKey: ['plans', planId, 'workouts'] });
  queryClient.invalidateQueries({ queryKey: ['plans', planId, 'schedule-entries'] });
}
