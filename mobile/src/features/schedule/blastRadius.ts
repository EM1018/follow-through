import { format, getISODay } from 'date-fns';

import type { components } from '@/api/schema';
import { parseDateOnly } from '@/lib/dates';

export type ScheduleEntry = components['schemas']['ScheduleEntryRead'];
export type ScheduleEntryPatch = components['schemas']['ScheduleEntryUpdate'];
export type DaySchedule = components['schemas']['DayScheduleRead'];
export type Workout = components['schemas']['WorkoutRead'];
export type WorkoutsById = Record<string, Workout>;

/** Patch fields that can change which dates an entry applies to -- see strandedBy. */
const STRANDING_FIELDS = ['day_of_week', 'on_date', 'starts_on', 'ends_on'] as const;

export type Action = 'cancel' | 'restore' | 'swap' | 'changeSwap' | 'undoSwap' | 'delete';

export const WEEKDAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

/**
 * Transitive closure over replaces_entry_id, excluding the root. Seeds the
 * visited set with entryId itself so a malformed cycle (A replaces B replaces
 * A) can't walk back through the root and loop forever.
 */
export function dependentsOf(entries: ScheduleEntry[], entryId: string): ScheduleEntry[] {
  const byParent = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    if (entry.replaces_entry_id) {
      const list = byParent.get(entry.replaces_entry_id) ?? [];
      list.push(entry);
      byParent.set(entry.replaces_entry_id, list);
    }
  }

  const visited = new Set<string>([entryId]);
  const result: ScheduleEntry[] = [];
  const queue = [entryId];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const child of byParent.get(current) ?? []) {
      if (visited.has(child.id)) {
        continue;
      }
      visited.add(child.id);
      result.push(child);
      queue.push(child.id);
    }
  }

  return result;
}

export function entriesForWorkout(entries: ScheduleEntry[], workoutId: string): ScheduleEntry[] {
  return entries.filter((entry) => entry.workout_id === workoutId);
}

/** Mirrors the backend's _matches (app/services/resolution.py): dated entries match exactly, recurring ones match by weekday within starts_on/ends_on. */
export function entryAppliesOn(entry: ScheduleEntry, date: Date): boolean {
  const dateParam = format(date, 'yyyy-MM-dd');

  if (entry.on_date !== null) {
    return entry.on_date === dateParam;
  }
  if (entry.day_of_week === null) {
    return false;
  }

  return (
    getISODay(date) === entry.day_of_week &&
    (entry.starts_on === null || entry.starts_on <= dateParam) &&
    (entry.ends_on === null || dateParam <= entry.ends_on)
  );
}

/**
 * Direct dependents (cancellations/replacements against `entry`) that `patch`
 * would strand: dated rows whose own date currently matches `entry` but
 * wouldn't once the patch lands, left pointing at a rule that no longer
 * applies there. Only day_of_week/on_date/starts_on/ends_on can strand
 * anything -- a workout_id/name_override change doesn't touch which dates the
 * rule covers, so this returns empty for those without inspecting dependents
 * at all. Direct dependents only: chains are flat as of prompt 12.
 */
export function strandedBy(
  entries: ScheduleEntry[],
  entry: ScheduleEntry,
  patch: ScheduleEntryPatch,
): { replacements: ScheduleEntry[]; cancellations: ScheduleEntry[] } {
  const canStrand = STRANDING_FIELDS.some((field) => field in patch);
  if (!canStrand) {
    return { replacements: [], cancellations: [] };
  }

  const patched: ScheduleEntry = { ...entry, ...patch };
  const replacements: ScheduleEntry[] = [];
  const cancellations: ScheduleEntry[] = [];

  for (const dependent of entries) {
    if (dependent.replaces_entry_id !== entry.id || dependent.on_date === null) {
      continue;
    }

    const dependentDate = parseDateOnly(dependent.on_date);
    const strandedNow = entryAppliesOn(entry, dependentDate) && !entryAppliesOn(patched, dependentDate);
    if (!strandedNow) {
      continue;
    }

    const isCancellation = dependent.workout_id === null && dependent.name_override === null;
    (isCancellation ? cancellations : replacements).push(dependent);
  }

  return { replacements, cancellations };
}

/** What the composite FK cascade will actually remove if a workout is deleted. */
export function workoutDeleteImpact(
  entries: ScheduleEntry[],
  workoutId: string,
): { direct: ScheduleEntry[]; cascaded: ScheduleEntry[] } {
  const direct = entriesForWorkout(entries, workoutId);
  const directIds = new Set(direct.map((entry) => entry.id));

  const cascadedById = new Map<string, ScheduleEntry>();
  for (const entry of direct) {
    for (const dependent of dependentsOf(entries, entry.id)) {
      if (!directIds.has(dependent.id)) {
        cascadedById.set(dependent.id, dependent);
      }
    }
  }

  return { direct, cascaded: Array.from(cascadedById.values()) };
}

export function entryDeleteImpact(
  entries: ScheduleEntry[],
  entryId: string,
): { root: ScheduleEntry | undefined; dependents: ScheduleEntry[] } {
  const root = entries.find((entry) => entry.id === entryId);
  return { root, dependents: dependentsOf(entries, entryId) };
}

/**
 * Walks replaces_entry_id upward to the entry that replaces nothing. Returns
 * entry itself if it's already a root. Cycle-safe: a visited set stops a
 * malformed loop from spinning forever, returning wherever the walk gave up.
 */
export function rootEntryOf(entries: ScheduleEntry[], entry: ScheduleEntry): ScheduleEntry {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const visited = new Set<string>([entry.id]);
  let current = entry;

  while (current.replaces_entry_id !== null) {
    const parent = byId.get(current.replaces_entry_id);
    if (!parent || visited.has(parent.id)) {
      return current;
    }
    visited.add(parent.id);
    current = parent;
  }

  return current;
}

/**
 * The dated row standing in for a cancellation on `dateParam` against
 * `targetEntryId` -- what DayScheduleRead.cancelled can't give us directly,
 * since EntryRefRead only carries the cancelled target's id and name, never
 * the cancellation row's own id. Matches the backend's _is_cancellation
 * predicate (app/services/resolution.py): replaces_entry_id set, no
 * workout_id, no name_override.
 */
export function findCancellationEntry(
  entries: ScheduleEntry[],
  dateParam: string,
  targetEntryId: string,
): ScheduleEntry | undefined {
  return entries.find(
    (entry) =>
      entry.on_date === dateParam &&
      entry.replaces_entry_id === targetEntryId &&
      entry.workout_id === null &&
      entry.name_override === null,
  );
}

/**
 * The ordered action list for the entry-actions sheet, keyed off the shape of
 * the specific entry that was tapped rather than day.status: DayStatus is a
 * day-wide summary (SUBSTITUTED only means *some* surviving entry that day is
 * a substitution) and branching on it for a single row's actions would
 * misclassify a mixed day. A tapped entry's own fields are unambiguous:
 * replaces_entry_id null is always a root (recurring or dated one-off); a
 * non-null replaces_entry_id with no workout_id is always a cancellation;
 * with a workout_id it's always a replacement. `day` is accepted to match the
 * sheet's other call sites and for future use, not because the switch needs it.
 */
export function actionsFor(_day: DaySchedule, entry: ScheduleEntry): Action[] {
  if (entry.replaces_entry_id === null) {
    return entry.day_of_week !== null ? ['cancel', 'swap', 'delete'] : ['swap', 'delete'];
  }

  const isCancellation = entry.workout_id === null && entry.name_override === null;
  return isCancellation ? ['restore', 'swap'] : ['changeSwap', 'undoSwap', 'cancel'];
}

/**
 * Other entries for the same workout and the same starts_on/ends_on bounds but
 * a different weekday -- how an MWF pattern is actually stored (three unlinked
 * rows). Always [] for dated entries, since those carry no day_of_week to match on.
 */
export function siblingWeekdays(entries: ScheduleEntry[], entry: ScheduleEntry): ScheduleEntry[] {
  if (entry.day_of_week === null) {
    return [];
  }

  return entries.filter(
    (other) =>
      other.id !== entry.id &&
      other.workout_id === entry.workout_id &&
      other.day_of_week !== null &&
      other.day_of_week !== entry.day_of_week &&
      other.starts_on === entry.starts_on &&
      other.ends_on === entry.ends_on,
  );
}

/**
 * When this entry falls, ignoring whether it's itself a swap/cancellation --
 * "Tue, Aug 18" or "every Monday". Used for describing an entry's OWN slot
 * (e.g. a delete-this-entry dialog title), as opposed to describeEntry's job
 * of labelling an entry when it's referenced from elsewhere.
 */
export function describeSchedule(entry: ScheduleEntry): string {
  if (entry.on_date) {
    return format(parseDateOnly(entry.on_date), 'EEE, MMM d');
  }

  if (entry.day_of_week !== null) {
    const dayName = WEEKDAY_NAMES[entry.day_of_week] ?? 'Unknown';
    if (entry.starts_on && entry.ends_on) {
      const starts = format(parseDateOnly(entry.starts_on), 'MMM d');
      const ends = format(parseDateOnly(entry.ends_on), 'MMM d');
      return `every ${dayName}, ${starts} – ${ends}`;
    }
    return `every ${dayName}`;
  }

  return 'a deleted workout';
}

/** Human label used when an entry is referenced from a dialog about something else -- a dependents or siblings list. */
export function describeEntry(entry: ScheduleEntry, workoutsById: WorkoutsById): string {
  if (entry.replaces_entry_id) {
    if (!entry.workout_id) {
      return 'cancelled';
    }
    const workout = workoutsById[entry.workout_id];
    return `swapped for ${workout ? workout.name : 'a deleted workout'}`;
  }

  return describeSchedule(entry);
}
