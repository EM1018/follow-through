import { formatAmount } from '@/features/logs/units';

import type { CommitmentRead } from './commitments';

/**
 * The one place sessions_per_week === 7 becomes "Every day" -- both the New
 * goal sheet's "How often" picker and a card's terms line call this, so the
 * two can never disagree about the label for the same underlying number.
 * `compact` is the card/collapsed-row form ("2×/wk"); `picker` is the
 * sheet's longer form ("2 × per week"), used for the picker's own rows.
 */
export function sessionsPerWeekLabel(sessionsPerWeek: number, style: 'compact' | 'picker' = 'picker'): string {
  if (sessionsPerWeek === 7) {
    return 'Every day';
  }
  return style === 'compact' ? `${sessionsPerWeek}×/wk` : `${sessionsPerWeek} × per week`;
}

/**
 * The card/collapsed-row terms line, e.g. "2 mi · 2×/wk", or just "2×/wk"
 * for an untargeted goal -- formatAmount (the Log tab's own amount
 * formatter) is reused as-is, not reimplemented, per the unit-label rule.
 */
export function goalTermsLine(
  commitment: Pick<CommitmentRead, 'target_value' | 'target_unit' | 'sessions_per_week'>,
): string {
  const amount = formatAmount(commitment.target_value, commitment.target_unit);
  const frequency = sessionsPerWeekLabel(commitment.sessions_per_week, 'compact');
  return amount ? `${amount} · ${frequency}` : frequency;
}

/**
 * Finished-card header, e.g. "Week 6 of 6" -- a finished goal is always
 * fixed-length (an ongoing goal never finishes), so duration_weeks doubles
 * as both the numerator and denominator: it ran its full declared length.
 */
export function finishedWeekLabel(durationWeeks: number): string {
  return `Week ${durationWeeks} of ${durationWeeks}`;
}

/** "2 week streak", "0 week streak" -- "week" stays singular at every count, per spec's own example. */
export function streakLabel(weeks: number): string {
  return `${weeks} week streak`;
}
