import type { CommitmentRead, CommitmentStatus, TrackRead } from './commitments';

/**
 * A goal is the commitment with no `them` -- the server leaves it out of a
 * goal's JSON rather than sending null. A null `them` means the contract was
 * broken, so it throws instead of quietly rendering a challenge as a goal.
 */
export function isGoal(commitment: Pick<CommitmentRead, 'id' | 'them'>): boolean {
  if (commitment.them === null) {
    throw new Error(`Commitment ${commitment.id} sent them: null -- it should be omitted on a goal`);
  }
  return commitment.them === undefined;
}

/**
 * The viewer's own track. `you` is only optional in the contract for
 * challenges that haven't started -- a goal's clock starts when it's created,
 * and every status that reaches the card (hasCardLayout) has a started clock.
 * Missing here is a backend bug or a gate that let the wrong row through, not
 * a state to draw.
 */
export function ownTrack(commitment: Pick<CommitmentRead, 'id' | 'you'>): TrackRead {
  if (commitment.you == null) {
    throw new Error(`Commitment ${commitment.id} arrived without its 'you' track`);
  }
  return commitment.you;
}

/**
 * Statuses the Goals tab card has a layout for. A goal is only ever one of
 * these; sent, invite, declined and expired are challenge-only and have no
 * card yet. F3 removes this filter when it builds them.
 */
const CARD_STATUSES: ReadonlySet<CommitmentStatus> = new Set(['active', 'finished', 'ended_early']);

export function hasCardLayout(commitment: Pick<CommitmentRead, 'status'>): boolean {
  return CARD_STATUSES.has(commitment.status);
}
