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
 * Mirrors the backend's completed rule (app/services/resolution.py::resolve):
 * true when at least one non-cancelled entry resolves that day and every one
 * of them has a completion. Same "at least one" guard as the backend -- zero
 * entries must never read as completed.
 */
export function dayCompletedFor(entries: DaySchedule['entries']): boolean {
  return entries.length > 0 && entries.every((entry) => entry.completion_id !== null);
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
      [dateParam]: {
        entries,
        cancelled,
        status: dayStatusFor(entries, cancelled),
        completed: dayCompletedFor(entries),
      },
    },
  };
}

/**
 * Optimistic edit for tap-to-log/unlog: sets or clears one entry's
 * completion_id on `dateParam` only, and recomputes `completed` from the
 * result. `completionId` is a client-generated placeholder while the create
 * request is in flight -- callers reconcile it with the server's real id
 * (or roll back entirely) once the request settles.
 */
export function applyOptimisticCompletion(
  response: ScheduleResponse,
  dateParam: string,
  entryId: string,
  completionId: string | null,
): ScheduleResponse {
  const day = response.days[dateParam];
  if (!day) {
    return response;
  }

  const entries = day.entries.map((entry) =>
    entry.entry_id === entryId ? { ...entry, completion_id: completionId } : entry,
  );

  return {
    days: {
      ...response.days,
      [dateParam]: { ...day, entries, completed: dayCompletedFor(entries) },
    },
  };
}
