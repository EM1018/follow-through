import { format } from 'date-fns';

import { parseDateOnly } from '@/lib/dates';

import { describeSchedule, WEEKDAY_NAMES, type ScheduleEntry, type ScheduleEntryPatch, type WorkoutsById } from './blastRadius';

export type StrandedResult = { replacements: ScheduleEntry[]; cancellations: ScheduleEntry[] };
export type DialogCopy = { title: string; message: string };

function describeStrandedDate(entry: ScheduleEntry): string {
  return format(parseDateOnly(entry.on_date as string), 'EEE, MMM d');
}

function strandedWorkoutName(entry: ScheduleEntry, workoutsById: WorkoutsById): string {
  if (entry.workout_id) {
    return workoutsById[entry.workout_id]?.name ?? 'a deleted workout';
  }
  return entry.name_override ?? 'a deleted workout';
}

/** An orphaned replacement stays visible -- the ghost users will report -- so it's named explicitly, never just counted. */
function replacementSentence(
  replacements: ScheduleEntry[],
  rootName: string,
  oldWhen: string,
  workoutsById: WorkoutsById,
): string {
  if (replacements.length === 0) {
    return '';
  }
  if (replacements.length === 1) {
    const entry = replacements[0];
    return `${describeStrandedDate(entry)} will keep showing ${strandedWorkoutName(entry, workoutsById)} in place of ${rootName}, even though ${rootName} no longer happens on ${oldWhen}.`;
  }
  const list = replacements.map((entry) => describeStrandedDate(entry)).join(', ');
  return `${list} will keep showing what they were swapped to, even though ${rootName} no longer happens on ${oldWhen}.`;
}

/** An orphaned cancellation goes inert -- still in the table, but with nothing left to suppress. */
function cancellationSentence(cancellations: ScheduleEntry[]): string {
  if (cancellations.length === 0) {
    return '';
  }
  if (cancellations.length === 1) {
    return `Your cancellation on ${describeStrandedDate(cancellations[0])} will have nothing left to cancel.`;
  }
  const list = cancellations.map((entry) => describeStrandedDate(entry)).join(', ');
  return `Your cancellations on ${list} will have nothing left to cancel.`;
}

function moveTitle(workoutName: string, patch: ScheduleEntryPatch): string {
  if (typeof patch.day_of_week === 'number') {
    return `Move ${workoutName} to ${WEEKDAY_NAMES[patch.day_of_week]}s?`;
  }
  if (typeof patch.on_date === 'string') {
    return `Move ${workoutName} to ${format(parseDateOnly(patch.on_date), 'EEE, MMM d')}?`;
  }
  return `Change ${workoutName}'s schedule?`;
}

/**
 * The stranded-confirm dialog for Edit schedule (2.2). Only called when
 * strandedBy found something -- an empty result PATCHes directly with no
 * confirmation at all, per the ground rule.
 */
export function moveConfirmCopy(
  workoutName: string,
  entry: ScheduleEntry,
  patch: ScheduleEntryPatch,
  stranded: StrandedResult,
  workoutsById: WorkoutsById,
): DialogCopy {
  const oldWhen = entry.day_of_week !== null ? `${WEEKDAY_NAMES[entry.day_of_week]}s` : 'that day';

  const sentences = [
    replacementSentence(stranded.replacements, workoutName, oldWhen, workoutsById),
    cancellationSentence(stranded.cancellations),
  ];

  if (typeof patch.day_of_week === 'number') {
    sentences.push('This also moves past occurrences, the same as deleting the recurrence would.');
  }

  return { title: moveTitle(workoutName, patch), message: sentences.filter(Boolean).join(' ') };
}

/**
 * Stop repeating (2.3) always confirms, stranded or not -- unlike Edit
 * schedule, the base sentence alone is reason enough to ask first. When
 * strandedBy also finds something, its sentences are appended and the same
 * clear-or-keep pair of actions applies.
 */
export function stopRepeatingConfirmCopy(
  workoutName: string,
  entry: ScheduleEntry,
  stranded: StrandedResult,
  workoutsById: WorkoutsById,
): DialogCopy {
  const dayName = entry.day_of_week !== null ? `${WEEKDAY_NAMES[entry.day_of_week]}s` : 'Occurrences';

  const sentences = [
    `${workoutName} will stop repeating after today. ${dayName} before today stay as they are.`,
    replacementSentence(stranded.replacements, workoutName, dayName, workoutsById),
    cancellationSentence(stranded.cancellations),
  ];

  return { title: `Stop repeating ${workoutName}?`, message: sentences.filter(Boolean).join(' ') };
}

/** Honest partial-failure message for Edit schedule's "Move and clear them" -- PATCH succeeded, some deletes didn't. */
export function moveFailureMessage(patch: ScheduleEntryPatch, failedCount: number): string {
  const dayNoun = failedCount === 1 ? 'day' : 'days';
  const destination =
    typeof patch.day_of_week === 'number'
      ? `${WEEKDAY_NAMES[patch.day_of_week]}s`
      : typeof patch.on_date === 'string'
        ? format(parseDateOnly(patch.on_date), 'EEE, MMM d')
        : 'the new schedule';
  return `Moved to ${destination}, but couldn't clear ${failedCount} leftover ${dayNoun}.`;
}

/** Honest partial-failure message for Stop repeating's clear-them path. */
export function stopRepeatingFailureMessage(failedCount: number): string {
  const dayNoun = failedCount === 1 ? 'day' : 'days';
  return `Stopped repeating, but couldn't clear ${failedCount} leftover ${dayNoun}.`;
}

/**
 * The cancel/complete invariant (1d, Direction A): cancelling or swapping a
 * day that's already logged is refused server-side (409) rather than
 * silently contradicting a fact the user already recorded. "Try again"
 * would be actively wrong here -- retrying just 409s again until the log
 * is removed first.
 */
export function loggedDayConflictMessage(action: 'cancel' | 'swap'): string {
  return `This day is already logged. Remove the log first, then ${action} it.`;
}

/**
 * Change workout (Stage 3) confirm copy. The reassurance about individually
 * swapped days only applies to a recurring entry -- a dated one-off has no
 * "other occurrences" a replacement could be pointing at instead of it.
 */
export function changeWorkoutConfirmCopy(entry: ScheduleEntry, newWorkoutName: string): DialogCopy {
  if (entry.day_of_week !== null) {
    const dayName = WEEKDAY_NAMES[entry.day_of_week];
    return {
      title: `Change every ${dayName} to ${newWorkoutName}?`,
      message: `Every ${dayName} becomes ${newWorkoutName}, including ${dayName}s already past. Days you swapped individually keep their swaps.`,
    };
  }

  const when = describeSchedule(entry);
  return {
    title: `Change ${when} to ${newWorkoutName}?`,
    message: `${when} becomes ${newWorkoutName}.`,
  };
}
