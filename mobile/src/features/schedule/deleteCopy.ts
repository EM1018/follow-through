import { format } from 'date-fns';

import { parseDateOnly } from '@/lib/dates';

import {
  describeEntry,
  describeSchedule,
  entryDeleteImpact,
  siblingWeekdays,
  workoutDeleteImpact,
  WEEKDAY_NAMES,
  type ScheduleEntry,
  type WorkoutsById,
} from './blastRadius';

const MAX_ENUMERATED = 5;

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items.join('');
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function formatEntryDate(entry: ScheduleEntry): string {
  if (entry.on_date) {
    return format(parseDateOnly(entry.on_date), 'MMM d');
  }
  if (entry.day_of_week !== null) {
    return WEEKDAY_NAMES[entry.day_of_week] ?? 'Unknown';
  }
  return 'unknown date';
}

/** Up to 5 items, individually enumerated -- never counted, per the no-undo ground rule. */
function enumerateEntries(entries: ScheduleEntry[], workoutsById: WorkoutsById): string {
  const shown = entries
    .slice(0, MAX_ENUMERATED)
    .map((entry) => `${formatEntryDate(entry)} — ${describeEntry(entry, workoutsById)}`);
  const remaining = entries.length - shown.length;
  return remaining > 0 ? `${shown.join('; ')}; and ${remaining} more` : shown.join('; ');
}

export type DialogCopy = { title: string; message: string };

/**
 * `direct` and `cascaded` counts describe rows (ScheduleEntryRead), the same
 * unit the workouts-list "N scheduled days" summary uses -- not an expansion
 * of recurring rows into individual calendar dates.
 */
export function workoutDeleteDialogCopy(
  workoutName: string,
  entries: ScheduleEntry[],
  workoutId: string,
  workoutsById: WorkoutsById,
): DialogCopy {
  const impact = workoutDeleteImpact(entries, workoutId);
  const title = `Delete ${workoutName}?`;

  if (impact.direct.length === 0) {
    return { title, message: "It isn't scheduled on any day." };
  }

  const list = impact.direct.map((entry) => describeEntry(entry, workoutsById)).join('; ');
  const dayNoun = impact.direct.length === 1 ? 'day' : 'days';
  let message = `This also removes it from ${impact.direct.length} scheduled ${dayNoun} (${list}), including days already past.`;

  if (impact.cascaded.length > 0) {
    const changeNoun = impact.cascaded.length === 1 ? 'change' : 'changes';
    message += ` It also deletes ${impact.cascaded.length} ${changeNoun} you made: ${enumerateEntries(impact.cascaded, workoutsById)}.`;
  }

  return { title, message };
}

export type EntryDialogCopy = DialogCopy & { siblings: ScheduleEntry[] };

export function entryDeleteDialogCopy(
  workoutName: string,
  entry: ScheduleEntry,
  entries: ScheduleEntry[],
  workoutsById: WorkoutsById,
): EntryDialogCopy {
  const impact = entryDeleteImpact(entries, entry.id);
  const siblings = siblingWeekdays(entries, entry);

  let title: string;
  let message = '';

  if (entry.on_date) {
    title = `Remove ${workoutName} on ${describeSchedule(entry)}?`;
  } else {
    title = `Remove ${workoutName} from ${describeSchedule(entry)}?`;
    const dayName = entry.day_of_week !== null ? WEEKDAY_NAMES[entry.day_of_week] : 'Unknown';
    message = `This removes it from all ${dayName}s, past and future.`;
  }

  if (siblings.length > 0) {
    const names = siblings.map((sibling) =>
      sibling.day_of_week !== null ? WEEKDAY_NAMES[sibling.day_of_week] : 'Unknown',
    );
    message += `${message ? ' ' : ''}${joinWithAnd(names)} will stay.`;
  }

  if (impact.dependents.length > 0) {
    const changeNoun = impact.dependents.length === 1 ? 'change' : 'changes';
    message += `${message ? ' ' : ''}This also deletes ${impact.dependents.length} ${changeNoun} you made: ${enumerateEntries(impact.dependents, workoutsById)}.`;
  }

  return { title, message, siblings };
}

/**
 * Restore and Undo swap are normally confirm-free (see EntryActionsSheet),
 * but flat chains mean a cancellation or replacement can still pick up
 * dependents in edge cases -- this is the one guard on either path,
 * mirroring entryDeleteDialogCopy's dependents copy.
 */
export function dependentsGuardDialogCopy(
  title: string,
  dependents: ScheduleEntry[],
  workoutsById: WorkoutsById,
): DialogCopy {
  const changeNoun = dependents.length === 1 ? 'change' : 'changes';
  return {
    title,
    message: `This also deletes ${dependents.length} ${changeNoun} you made: ${enumerateEntries(dependents, workoutsById)}.`,
  };
}

export function restoreDialogCopy(dependents: ScheduleEntry[], workoutsById: WorkoutsById): DialogCopy {
  return dependentsGuardDialogCopy('Restore this day?', dependents, workoutsById);
}

export function undoSwapDialogCopy(dependents: ScheduleEntry[], workoutsById: WorkoutsById): DialogCopy {
  return dependentsGuardDialogCopy('Undo swap?', dependents, workoutsById);
}
