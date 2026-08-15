import type { components } from '@/api/schema';

export type ScheduleResponse = components['schemas']['ScheduleResponse'];
export type DaySchedule = components['schemas']['DayScheduleRead'];
export type DayStatus = components['schemas']['DayStatus'];

/**
 * Mirrors the backend's status precedence (app/services/resolution.py::resolve):
 * substituted beats scheduled beats cancelled beats empty. Lets an optimistic
 * edit that only touches entries/cancelled recompute a status consistent with
 * what the next refetch will return.
 */
export function dayStatusFor(entries: DaySchedule['entries'], cancelled: DaySchedule['cancelled']): DayStatus {
  if (entries.some((entry) => entry.status === 'substituted')) {
    return 'substituted';
  }
  if (entries.length > 0) {
    return 'scheduled';
  }
  if (cancelled.length > 0) {
    return 'cancelled';
  }
  return 'empty';
}

/**
 * Optimistic edit for Cancel: moves the tapped entry out of `entries` and
 * appends a cancellation ref for it, on `dateParam` only -- cache entries for
 * other dates pass through untouched. A no-op if this response doesn't carry
 * `dateParam` (a range query that doesn't cover it).
 */
export function applyOptimisticCancel(
  response: ScheduleResponse,
  dateParam: string,
  entryId: string,
  name: string | null,
): ScheduleResponse {
  const day = response.days[dateParam];
  if (!day) {
    return response;
  }

  const entries = day.entries.filter((entry) => entry.entry_id !== entryId);
  const cancelled = [...day.cancelled, { entry_id: entryId, name }];

  return {
    days: {
      ...response.days,
      [dateParam]: { entries, cancelled, status: dayStatusFor(entries, cancelled) },
    },
  };
}
