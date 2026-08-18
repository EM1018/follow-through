import type { components } from '@/api/schema';

export type Unit = components['schemas']['Unit'];

/**
 * Display labels only -- the unit-to-dimension map ships on GET /activities
 * (see activities.ts) and must be read from there, not hardcoded here.
 */
export const UNIT_LABELS: Record<Unit, { short: string; long: string }> = {
  minutes: { short: 'min', long: 'minutes' },
  hours: { short: 'hr', long: 'hours' },
  miles: { short: 'mi', long: 'miles' },
  kilometers: { short: 'km', long: 'kilometers' },
  sets: { short: 'sets', long: 'sets' },
  reps: { short: 'reps', long: 'reps' },
};

function trimmedNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Null when either half is missing -- a completion with no amount renders no amount, never "0". */
export function formatAmount(value: number | null, unit: Unit | null): string | null {
  if (value === null || unit === null) {
    return null;
  }

  const amount = trimmedNumber(value);
  if (unit === 'sets') {
    return `${amount} ${value === 1 ? 'set' : 'sets'}`;
  }
  if (unit === 'reps') {
    return `${amount} ${value === 1 ? 'rep' : 'reps'}`;
  }
  return `${amount} ${UNIT_LABELS[unit].short}`;
}
