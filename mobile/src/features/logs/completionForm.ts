import type { Activity, ActivityInfo, Dimension, UnitInfo } from './activities';
import type { CompletionCreate, CompletionRead, CompletionUpdate } from './completions';
import type { Unit } from './units';

export type CompletionForm = {
  activity: Activity | null;
  value: string;
  unit: Unit | null;
  onDate: string;
  note: string;
};

function isValidAmount(value: string, unit: Unit | null): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return true;
  }
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return false;
  }
  return unit !== null;
}

/** Activity is required; an amount is optional but, once started, must resolve to a positive number with a unit. */
export function canSave(form: CompletionForm): boolean {
  return form.activity !== null && isValidAmount(form.value, form.unit);
}

/**
 * Applied whenever the activity changes, including the first pick: a unit
 * still permitted under the new activity survives, otherwise it clears and
 * the new activity's default (if any) takes over. Switching from running
 * with 3 / miles to strength training must not leave miles selected.
 */
export function resetUnitForActivity(currentUnit: Unit | null, activity: ActivityInfo): Unit | null {
  if (currentUnit !== null && activity.units.includes(currentUnit)) {
    return currentUnit;
  }
  return activity.default_unit;
}

const DIMENSION_ORDER: Dimension[] = ['time', 'distance', 'count'];

/** Same-dimension units grouped together; groups ordered time -> distance -> count, unit order within a group preserved. */
export function groupUnitsByDimension(units: Unit[], unitInfos: UnitInfo[]): Unit[][] {
  const dimensionByUnit = new Map(unitInfos.map((info) => [info.unit, info.dimension]));
  const groups = new Map<Dimension, Unit[]>();

  for (const unit of units) {
    const dimension = dimensionByUnit.get(unit);
    if (!dimension) {
      continue;
    }
    const group = groups.get(dimension);
    if (group) {
      group.push(unit);
    } else {
      groups.set(dimension, [unit]);
    }
  }

  return DIMENSION_ORDER.map((dimension) => groups.get(dimension)).filter(
    (group): group is Unit[] => group !== undefined,
  );
}

export function buildCreatePayload(form: CompletionForm): CompletionCreate {
  const trimmedValue = form.value.trim();
  const trimmedNote = form.note.trim();
  return {
    activity: form.activity,
    on_date: form.onDate,
    value: trimmedValue === '' ? null : Number(trimmedValue),
    unit: trimmedValue === '' ? null : form.unit,
    note: trimmedNote === '' ? null : trimmedNote,
  };
}

/** Only fields that actually changed -- clearing the value nulls both value and unit rather than omitting them. */
export function buildPatch(original: CompletionRead, form: CompletionForm): CompletionUpdate {
  const patch: CompletionUpdate = {};

  const trimmedNote = form.note.trim();
  const originalNote = original.note ?? '';
  if (trimmedNote !== originalNote) {
    patch.note = trimmedNote === '' ? null : trimmedNote;
  }

  const trimmedValue = form.value.trim();
  const newValue = trimmedValue === '' ? null : Number(trimmedValue);
  const newUnit = trimmedValue === '' ? null : form.unit;
  if (newValue !== original.value || newUnit !== original.unit) {
    patch.value = newValue;
    patch.unit = newUnit;
  }

  return patch;
}

/** Disabled rather than a no-op PATCH when nothing changed. */
export function canSaveEdit(original: CompletionRead, form: CompletionForm): boolean {
  return isValidAmount(form.value, form.unit) && Object.keys(buildPatch(original, form)).length > 0;
}
