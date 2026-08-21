import type { Activity, ActivityInfo } from '@/features/logs/activities';
import { resetUnitForActivity } from '@/features/logs/completionForm';
import type { Unit } from '@/features/logs/units';
import { UNIT_LABELS } from '@/features/logs/units';

import type { CommitmentCreate } from './commitments';
import { sessionsPerWeekLabel } from './goalTerms';

export type GoalAmount = { kind: 'none' } | { kind: 'set'; value: string; unit: Unit | null };

export type GoalDuration = { kind: 'weeks'; weeks: number } | { kind: 'ongoing' };

export type GoalForm = {
  activity: Activity | null;
  amount: GoalAmount;
  sessionsPerWeek: number;
  duration: GoalDuration;
};

export const MIN_SESSIONS_PER_WEEK = 1;
export const MAX_SESSIONS_PER_WEEK = 7;
export const MIN_DURATION_WEEKS = 1;
export const MAX_DURATION_WEEKS = 8;

export function defaultGoalForm(): GoalForm {
  return {
    activity: null,
    amount: { kind: 'none' },
    sessionsPerWeek: 2,
    duration: { kind: 'weeks', weeks: 2 },
  };
}

/** Prefills the unit from the activity's default_unit -- null (strength_training, other) leaves the unit picker empty. */
export function startSettingTarget(activity: ActivityInfo): GoalAmount {
  return { kind: 'set', value: '', unit: activity.default_unit };
}

/**
 * Applied when the activity changes while "Set one" is already chosen -- same
 * reasoning as the Log sheet's resetUnitForActivity, reused as-is rather than
 * reimplemented: a unit still permitted under the new activity survives,
 * otherwise it clears to the new activity's default (if any).
 */
export function resetAmountForActivity(amount: GoalAmount, activity: ActivityInfo): GoalAmount {
  if (amount.kind === 'none') {
    return amount;
  }
  return { ...amount, unit: resetUnitForActivity(amount.unit, activity) };
}

/**
 * True whenever "Set one" is chosen but no unit yet -- this is what makes
 * "a value with no unit" unconstructable rather than merely invalid: the
 * field the user would type a number into is disabled until there's a unit
 * for that number to mean something in.
 */
export function isAmountValueDisabled(form: Pick<GoalForm, 'amount'>): boolean {
  return form.amount.kind === 'set' && form.amount.unit === null;
}

/**
 * Save is gated on activity alone -- every other row arrives with a default,
 * so a disabled Save with nothing else on screen is self-explanatory. An
 * incomplete "Set one" (a unit chosen but the value left blank) isn't a
 * second disabling reason; buildGoalCreatePayload just treats it as no
 * target, the same choice as if "No target" had been picked instead.
 */
export function canSaveGoal(form: GoalForm): boolean {
  return form.activity !== null;
}

function resolvedTarget(amount: GoalAmount): { value: number; unit: Unit } | null {
  if (amount.kind !== 'set' || amount.unit === null) {
    return null;
  }
  const trimmed = amount.value.trim();
  if (trimmed === '') {
    return null;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return { value: numeric, unit: amount.unit };
}

export function buildGoalCreatePayload(form: GoalForm): CommitmentCreate {
  if (form.activity === null) {
    throw new Error('buildGoalCreatePayload requires an activity - guard with canSaveGoal first');
  }
  const target = resolvedTarget(form.amount);
  return {
    activity: form.activity,
    target_value: target?.value ?? null,
    target_unit: target?.unit ?? null,
    sessions_per_week: form.sessionsPerWeek,
    duration_weeks: form.duration.kind === 'weeks' ? form.duration.weeks : null,
  };
}

const ACTIVITY_VERBS: Record<Activity, string> = {
  running: 'Run',
  walking: 'Walk',
  cycling: 'Cycle',
  swimming: 'Swim',
  strength_training: 'Strength train',
  cardio: 'Do cardio',
  stretching_mobility: 'Stretch',
  other: 'Train',
};

function frequencyClause(sessionsPerWeek: number): string {
  if (sessionsPerWeek === 7) {
    return 'every day';
  }
  return sessionsPerWeek === 1 ? '1 time a week' : `${sessionsPerWeek} times a week`;
}

function durationClause(duration: GoalDuration): string {
  if (duration.kind === 'ongoing') {
    return 'ongoing';
  }
  return `for ${duration.weeks} week${duration.weeks === 1 ? '' : 's'}`;
}

/**
 * The sheet's live teaching-moment sentence -- every clause here maps onto
 * something the card later shows, so reading it back catches nonsense (a
 * wrong unit, a forgotten duration) before it's ever saved. Null only when
 * there's no activity yet, the one row without a default.
 */
export function goalSummarySentence(form: GoalForm): string | null {
  if (form.activity === null) {
    return null;
  }
  const verb = ACTIVITY_VERBS[form.activity];
  const frequency = frequencyClause(form.sessionsPerWeek);
  const duration = durationClause(form.duration);

  const target = resolvedTarget(form.amount);
  if (target) {
    const unitLabel = UNIT_LABELS[target.unit].long;
    return `${verb} at least ${target.value} ${unitLabel}, ${frequency}, ${duration}.`;
  }
  return `${verb} ${frequency}, ${duration}.`;
}

/** The "How often" picker's own option labels, sharing sessionsPerWeekLabel with the card's terms line. */
export function sessionsPickerOptions(): { value: number; label: string }[] {
  const options: { value: number; label: string }[] = [];
  for (let value = MIN_SESSIONS_PER_WEEK; value <= MAX_SESSIONS_PER_WEEK; value++) {
    options.push({ value, label: sessionsPerWeekLabel(value, 'picker') });
  }
  return options;
}
