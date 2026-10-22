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
 * and GoalCard branches unstarted challenges (isUnstarted) off before it ever
 * asks for a track. Missing here is a backend bug, not a state to draw.
 */
export function ownTrack(commitment: Pick<CommitmentRead, 'id' | 'you'>): TrackRead {
  if (commitment.you == null) {
    throw new Error(`Commitment ${commitment.id} arrived without its 'you' track`);
  }
  return commitment.you;
}

/** A challenge whose clock never started -- the server sends no `you` and no `them.track` on these. */
export type UnstartedStatus = Extract<CommitmentStatus, 'sent' | 'invite' | 'declined' | 'expired'>;

const UNSTARTED_STATUSES: ReadonlySet<CommitmentStatus> = new Set<UnstartedStatus>([
  'sent',
  'invite',
  'declined',
  'expired',
]);

/**
 * Read straight off the server's status -- never inferred from `you` being
 * absent, since absence is what the status explains, not what decides it.
 */
export function isUnstarted(
  commitment: Pick<CommitmentRead, 'status'>,
): commitment is Pick<CommitmentRead, 'status'> & { status: UnstartedStatus } {
  return UNSTARTED_STATUSES.has(commitment.status);
}
