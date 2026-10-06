import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from enum import StrEnum

from app.models.commitment import Commitment, InviteStatus
from app.models.completion import Completion
from app.services.activities import Unit

_MINUTES_PER_HOUR = Decimal(60)
_KILOMETERS_PER_MILE = Decimal("1.609344")  # exact, by definition (1 mile = 1609.344 m)
_MILES_PER_KILOMETER = Decimal(1) / _KILOMETERS_PER_MILE

# (from_unit, to_unit) -> multiplicative factor: `value_in_from_unit * factor`
# is the equivalent amount in `to_unit`. The table is the authority on whether
# two units are comparable at all, not the Dimension label in
# app/services/activities.py - a missing key means no match, even between
# units that share a dimension (there is no entry between `sets` and `reps`,
# despite both being COUNT). Conversion lives only here; the frontend never
# converts anything itself.
CONVERSION_FACTORS: dict[tuple[Unit, Unit], Decimal] = {
    (Unit.MINUTES, Unit.MINUTES): Decimal(1),
    (Unit.HOURS, Unit.HOURS): Decimal(1),
    (Unit.MILES, Unit.MILES): Decimal(1),
    (Unit.KILOMETERS, Unit.KILOMETERS): Decimal(1),
    (Unit.SETS, Unit.SETS): Decimal(1),
    (Unit.REPS, Unit.REPS): Decimal(1),
    (Unit.MINUTES, Unit.HOURS): Decimal(1) / _MINUTES_PER_HOUR,
    (Unit.HOURS, Unit.MINUTES): _MINUTES_PER_HOUR,
    (Unit.MILES, Unit.KILOMETERS): _KILOMETERS_PER_MILE,
    (Unit.KILOMETERS, Unit.MILES): _MILES_PER_KILOMETER,
}


class BlockStatus(StrEnum):
    PASSED = "passed"
    IN_PROGRESS = "in_progress"
    MISSED = "missed"


@dataclass
class Block:
    index: int
    starts_on: date
    ends_on: date
    sessions_done: int
    sessions_required: int
    status: BlockStatus


@dataclass
class Progress:
    blocks: list[Block]
    current_streak: int
    longest_streak: int
    weeks_passed: int
    weeks_total: int


def completion_satisfies(commitment: Commitment, completion: Completion) -> bool:
    """Whether a single logged completion counts toward `commitment`.

    The target is a lower bound - a completion valued above it still counts.
    A valueless completion only ever satisfies a commitment with no target;
    it can't be compared against one that has an amount to hit.
    """
    if completion.activity is None or completion.activity != commitment.activity:
        return False

    if commitment.target_value is None:
        return True

    if completion.value is None or completion.unit is None:
        return False

    factor = CONVERSION_FACTORS.get((Unit(completion.unit), Unit(commitment.target_unit)))
    if factor is None:
        return False

    converted_value = completion.value * factor
    return converted_value >= commitment.target_value


def _block_bounds(starts_on: date, index: int) -> tuple[date, date]:
    # 7-day windows counted from starts_on, not ISO Mon-Sun - a Friday start
    # gets a full 7-day first block instead of a doomed 2-day stub.
    block_starts_on = starts_on + timedelta(days=7 * index)
    return block_starts_on, block_starts_on + timedelta(days=6)


def _sessions_done(
    commitment: Commitment,
    completions: Sequence[Completion],
    block_starts_on: date,
    block_ends_on: date,
) -> int:
    # Distinct days, not raw completion count - three runs in one morning are
    # one session, not three. Isolated to this line so it can be flipped to
    # a plain count later if that decision proves wrong in use.
    qualifying_days = {
        completion.on_date
        for completion in completions
        if block_starts_on <= completion.on_date <= block_ends_on
        and completion_satisfies(commitment, completion)
    }
    return len(qualifying_days)


def compute_progress(
    commitment: Commitment, completions: Sequence[Completion], today: date
) -> Progress:
    """Pure and clock-blind, same shape as resolve() in resolution.py - `today`
    is always a parameter, never read from a clock, so a caller-supplied
    timezone (e.g. a future users.timezone column) only ever changes what gets
    passed in here, not this function's body.
    """
    starts_on = commitment.starts_on
    if starts_on is None:
        # A challenge nobody has accepted yet - its clock starts at accept, so
        # there are no blocks to walk. Goals never get here
        # (ck_commitments_goal_shape).
        return Progress(
            blocks=[],
            current_streak=0,
            longest_streak=0,
            weeks_passed=0,
            weeks_total=commitment.duration_weeks or 0,
        )

    if commitment.ended_on is not None:
        # Only fully-elapsed blocks (ends_on <= ended_on) survive - one still
        # open when the goal ended is dropped entirely, never stamped missed.
        # duration_weeks and `today` are both ignored here: an ended goal is
        # finished as of ended_on, full stop, regardless of either.
        max_index = (commitment.ended_on - starts_on - timedelta(days=6)).days // 7
        weeks_total = max_index + 1 if max_index >= 0 else 0
    elif commitment.duration_weeks is not None:
        current_index = (today - starts_on).days // 7
        max_index = min(current_index, commitment.duration_weeks - 1)
        weeks_total = commitment.duration_weeks
    else:
        current_index = (today - starts_on).days // 7
        max_index = current_index
        weeks_total = current_index + 1

    blocks: list[Block] = []
    for index in range(max_index + 1):
        block_starts_on, block_ends_on = _block_bounds(starts_on, index)
        sessions_done = _sessions_done(commitment, completions, block_starts_on, block_ends_on)

        # PASSED takes priority regardless of where `today` falls - hitting the
        # target closes a block out early. Otherwise: still open (contains
        # today) is IN_PROGRESS, already elapsed and short is MISSED. Blocks
        # entirely after today are never constructed at all (max_index caps
        # the loop), so there is no third, future-dated case to handle here.
        # An ended commitment can never be IN_PROGRESS - every block emitted
        # above already ended on or before ended_on, so there's no more time
        # left for it to still be open.
        if sessions_done >= commitment.sessions_per_week:
            status = BlockStatus.PASSED
        elif commitment.ended_on is None and block_starts_on <= today <= block_ends_on:
            status = BlockStatus.IN_PROGRESS
        else:
            status = BlockStatus.MISSED

        blocks.append(
            Block(
                index=index,
                starts_on=block_starts_on,
                ends_on=block_ends_on,
                sessions_done=sessions_done,
                sessions_required=commitment.sessions_per_week,
                status=status,
            )
        )

    longest_streak = 0
    run = 0
    for block in blocks:
        if block.status == BlockStatus.PASSED:
            run += 1
            longest_streak = max(longest_streak, run)
        else:
            run = 0

    # current_streak only ever looks at CLOSED blocks - an IN_PROGRESS block
    # can only be the very last one (every earlier block is necessarily fully
    # in the past), so dropping just a trailing IN_PROGRESS block is enough to
    # make it neither break nor extend the streak.
    closed_blocks = (
        blocks[:-1] if blocks and blocks[-1].status == BlockStatus.IN_PROGRESS else blocks
    )
    current_streak = 0
    for block in reversed(closed_blocks):
        if block.status != BlockStatus.PASSED:
            break
        current_streak += 1

    weeks_passed = sum(1 for block in blocks if block.status == BlockStatus.PASSED)

    return Progress(
        # Streaks above are computed over the full walk; only the returned
        # array is sliced, so payload size stays constant whether a goal is
        # 3 weeks or 3 years old.
        blocks=blocks[-8:],
        current_streak=current_streak,
        longest_streak=longest_streak,
        weeks_passed=weeks_passed,
        weeks_total=weeks_total,
    )


# How long a pending invite stays answerable. The only place this number
# lives - everything that cares whether an invite is still live calls
# is_live_pending() rather than redoing the arithmetic, so the list read, the
# accept guard, and the duplicate check at send can never disagree about it.
INVITE_LIVE_DAYS = 14


def is_live_pending(commitment: Commitment, today: date) -> bool:
    """Whether `commitment` is a pending invite that can still be answered.

    Expiry is derived, never stored - same idea as "finished", which is
    computed from starts_on + duration_weeks rather than flagged. There is no
    `expired` invite_status and no job that writes one; a pending row just
    stops being live once INVITE_LIVE_DAYS have passed. The bound is
    exclusive: live through day 13, expired from day 14 on.
    """
    if commitment.invite_status != InviteStatus.PENDING:
        return False

    return today - commitment.created_at.date() < timedelta(days=INVITE_LIVE_DAYS)


class CommitmentStatus(StrEnum):
    GOAL = "goal"
    DECLINED = "declined"
    SENT = "sent"
    INVITE = "invite"
    EXPIRED = "expired"
    ENDED_EARLY = "ended_early"
    FINISHED = "finished"
    ACTIVE = "active"


def derive_status(commitment: Commitment, viewer_id: uuid.UUID, today: date) -> CommitmentStatus:
    """The one status a commitment has for `viewer_id` as of `today`.

    A ladder, not a set of independent checks - several rungs can be true of
    the same row at once, so the order below is the rule, not a style choice.

    Clock-blind, like compute_progress(): `today` is computed once per request
    by the caller and handed to both, so status and progress can never land on
    different dates either side of midnight within a single response.
    """
    if commitment.invite_status is None:
        return CommitmentStatus.GOAL

    if commitment.invite_status == InviteStatus.DECLINED:
        return CommitmentStatus.DECLINED

    if commitment.invite_status == InviteStatus.PENDING:
        if not is_live_pending(commitment, today):
            return CommitmentStatus.EXPIRED
        # One row holds both participants - there is no second row for the
        # recipient - so the same pending row reads differently depending on
        # who is looking at it.
        if viewer_id == commitment.creator_id:
            return CommitmentStatus.SENT
        return CommitmentStatus.INVITE

    # Only accepted challenges get this far, and one without both terms is an
    # impossible row: Ongoing is rejected at send, and accept stamps starts_on
    # in the same transaction that sets the status. Answering "active" would
    # be a challenge that never finishes and never leaves anyone's list with
    # nothing reporting a problem - raising points at the write path that let
    # the row through instead. Pending rows legitimately have no starts_on,
    # which is why this sits below their rung and not above it.
    if commitment.starts_on is None:
        raise ValueError(f"accepted challenge {commitment.id} has no starts_on")
    if commitment.duration_weeks is None:
        raise ValueError(f"accepted challenge {commitment.id} has no duration_weeks")

    # ended_on before the end-date comparison, always. A quit challenge
    # eventually passes its original end date too - checked the other way
    # round, every quit would quietly turn into "finished" once enough time
    # went by, and who ended it early would drop out of the UI.
    if commitment.ended_on is not None:
        return CommitmentStatus.ENDED_EARLY

    ends_on = commitment.starts_on + timedelta(weeks=commitment.duration_weeks)
    if today >= ends_on:
        return CommitmentStatus.FINISHED

    return CommitmentStatus.ACTIVE


def blocks_new_challenge(commitment: Commitment, today: date) -> bool:
    """Whether an existing challenge between two people stops them starting
    another one for the same activity: it does while it's active or still an
    answerable invite, and stops the moment it's declined, expired, quit, or
    finished.

    Built from is_live_pending() and derive_status() rather than its own date
    arithmetic - if this drifted from them, an expired invite could vanish
    from both participants' lists while still blocking every new send, with
    nothing in the app able to clear it.
    """
    if is_live_pending(commitment, today):
        return True
    # "active" reads the same for both participants, so whose eyes
    # derive_status looks through doesn't matter here.
    return derive_status(commitment, commitment.creator_id, today) == CommitmentStatus.ACTIVE
