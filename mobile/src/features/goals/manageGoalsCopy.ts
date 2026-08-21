import type { CommitmentRead } from './commitments';
import { goalTermsLine } from './goalTerms';

export type GoalVariant = 'active' | 'finished';

type PositionInput = Pick<CommitmentRead, 'duration_weeks'> & {
  progress: Pick<CommitmentRead['progress'], 'blocks' | 'weeks_passed' | 'weeks_total'>;
};

function positionLabel(commitment: PositionInput, variant: GoalVariant): string {
  if (variant === 'finished') {
    return `${commitment.progress.weeks_passed} of ${commitment.progress.weeks_total} weeks passed`;
  }
  if (commitment.duration_weeks === null) {
    return 'ongoing';
  }
  // The last block is always the current one -- same reasoning as GoalCard's
  // currentBlock: only the most recent block can ever be in progress.
  const blocks = commitment.progress.blocks;
  const currentIndex = blocks.length > 0 ? blocks[blocks.length - 1].index : 0;
  return `week ${currentIndex + 1} of ${commitment.duration_weeks}`;
}

/**
 * Manage-goals row subtitle: terms plus position, e.g. "2 mi · 2×/wk · week
 * 2 of 2". This screen is administrative, not motivational -- no progress
 * circles or hero numbers, just enough to tell two similar goals apart.
 */
export function goalRowSubtitle(
  commitment: Pick<CommitmentRead, 'target_value' | 'target_unit' | 'sessions_per_week'> & PositionInput,
  variant: GoalVariant,
): string {
  return `${goalTermsLine(commitment)} · ${positionLabel(commitment, variant)}`;
}

/** Finished goals have nothing left to end -- Delete is the only option. */
export function canEndGoal(variant: GoalVariant): boolean {
  return variant === 'active';
}

export const END_GOAL_CONFIRM_TITLE = 'End this goal?';
// Names the dropped partial week specifically -- without it, ending mid-week
// looks like a bug rather than the intended behavior.
export const END_GOAL_CONFIRM_MESSAGE =
  "It moves to Finished with the weeks you've completed. This week won't count.";

export const DELETE_GOAL_CONFIRM_TITLE = 'Delete this goal?';
// Says what survives, not just what dies -- completions are facts about the
// user, never children of a commitment, and saying so is what makes this
// feel safe rather than like erasing training history.
export const DELETE_GOAL_CONFIRM_MESSAGE =
  'Its progress is gone for good. Your logged workouts stay in your log.';
