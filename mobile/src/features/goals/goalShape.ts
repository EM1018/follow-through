import type { CommitmentRead, TrackRead } from './commitments';

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
 * A goal's own track. `you` is only optional in the contract for challenges
 * that haven't started; a goal's clock starts when it's created, so the
 * server always sends it. Missing here is a backend bug, not a state to draw.
 */
export function goalTrack(goal: Pick<CommitmentRead, 'id' | 'you'>): TrackRead {
  if (goal.you == null) {
    throw new Error(`Goal ${goal.id} arrived without its 'you' track`);
  }
  return goal.you;
}
