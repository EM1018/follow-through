import type { CommitmentRead, CommitmentsListResponse } from './commitments';
import { isGoal, isUnstarted } from './goalShape';

export type GoalSections = {
  invites: CommitmentRead[];
  active: CommitmentRead[];
  finished: CommitmentRead[];
};

/**
 * The Goals tab's three sections, by how much attention each demands:
 * invites waiting on the viewer, then what's running, then what's over.
 *
 * Split in memory from the one list the screen already holds -- no request
 * of its own. Only `invite` moves: a `sent` row is the viewer's own outgoing
 * invite and stays in Active, and declined/expired already arrive in the
 * server's `finished` bucket. Keyed on status, not on which bucket an invite
 * came in, so an invite always lands here. Server order is kept within each.
 */
export function partitionCards(data: CommitmentsListResponse): GoalSections {
  const isInvite = (c: CommitmentRead) => c.status === 'invite';
  return {
    invites: [...data.active, ...data.finished].filter(isInvite),
    active: data.active.filter((c) => !isInvite(c)),
    finished: data.finished.filter((c) => !isInvite(c)),
  };
}

/**
 * The card expanded on a cold open: the first one with progress to show.
 * Unstarted challenges (which the server sorts to the top of `active`)
 * have nothing to expand into, so they're skipped.
 */
export function defaultExpandedId(sections: GoalSections): string | null {
  const started = [...sections.active, ...sections.finished].find((c) => !isUnstarted(c));
  return started?.id ?? null;
}

export type GoalFilter = 'all' | 'solo' | 'friends';

/**
 * The chips only appear once there's a challenge to tell apart from goals --
 * a user with only goals never sees them. Counts every section, invites
 * included: an invite alone is reason enough to offer "Friends".
 */
export function hasAnyChallenge(sections: GoalSections): boolean {
  return [...sections.invites, ...sections.active, ...sections.finished].some((c) => !isGoal(c));
}

/**
 * In memory, over what's already loaded -- no refetch. Solo is goals (no
 * `them`), Friends is challenges; both narrow Active and Finished alike.
 * Solo empties Invites outright: an invite is a challenge by definition.
 */
export function filterSections(sections: GoalSections, filter: GoalFilter): GoalSections {
  if (filter === 'all') {
    return sections;
  }
  const keep = filter === 'solo' ? isGoal : (c: CommitmentRead) => !isGoal(c);
  return {
    invites: filter === 'solo' ? [] : sections.invites,
    active: sections.active.filter(keep),
    finished: sections.finished.filter(keep),
  };
}

/**
 * Running challenges as the server counts them for the cap: accepted, not
 * ended, still active -- which is exactly status 'active' on a challenge.
 * Taken over the unfiltered sections, so a chip can never hide one from the
 * count. Goals never count.
 */
export function runningChallengeCount(sections: GoalSections): number {
  return [...sections.active, ...sections.finished].filter((c) => !isGoal(c) && c.status === 'active').length;
}
