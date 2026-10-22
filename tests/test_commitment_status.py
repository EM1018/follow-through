import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from app.models.commitment import Commitment, InviteStatus
from app.services.commitments import (
    INVITE_LIVE_DAYS,
    CommitmentStatus,
    derive_status,
    is_live_pending,
)

CREATOR = uuid.uuid4()
RECIPIENT = uuid.uuid4()

# Every row is created on this date; tests move `today` relative to it rather
# than moving the row, since `today` is the only thing either function reads
# time from.
CREATED_ON = date(2026, 3, 2)
STARTS_ON = date(2026, 3, 4)


def _commitment(
    *,
    invite_status: InviteStatus | None,
    recipient_id: uuid.UUID | None = RECIPIENT,
    starts_on: date | None = STARTS_ON,
    duration_weeks: int | None = 4,
    ended_on: date | None = None,
) -> Commitment:
    return Commitment(
        creator_id=CREATOR,
        recipient_id=recipient_id,
        activity="running",
        sessions_per_week=3,
        duration_weeks=duration_weeks,
        starts_on=starts_on,
        invite_status=invite_status,
        ended_on=ended_on,
        created_at=datetime(CREATED_ON.year, CREATED_ON.month, CREATED_ON.day, 12, tzinfo=UTC),
    )


def _days_after_created(days: int) -> date:
    return CREATED_ON + timedelta(days=days)


# is_live_pending


@pytest.mark.parametrize(
    ("days_since_created", "expected"),
    [
        (0, True),
        (1, True),
        (13, True),  # last live day
        (14, False),  # the bound is exclusive - day 14 is already expired
        (15, False),
    ],
)
def test_is_live_pending_window(days_since_created: int, expected: bool) -> None:
    commitment = _commitment(invite_status=InviteStatus.PENDING)

    assert is_live_pending(commitment, _days_after_created(days_since_created)) is expected


def test_invite_live_days_is_fourteen() -> None:
    assert INVITE_LIVE_DAYS == 14


@pytest.mark.parametrize(
    "invite_status",
    [None, InviteStatus.ACCEPTED, InviteStatus.DECLINED],
)
def test_is_live_pending_is_false_for_anything_not_pending(
    invite_status: InviteStatus | None,
) -> None:
    # Well inside the window, so only invite_status can be what says no.
    commitment = _commitment(invite_status=invite_status)

    assert is_live_pending(commitment, _days_after_created(1)) is False


# derive_status - one row per rung of the ladder

LAST_DAY = STARTS_ON + timedelta(weeks=4) - timedelta(days=1)
END_DATE = STARTS_ON + timedelta(weeks=4)

LADDER_CASES = [
    pytest.param(
        _commitment(invite_status=None, recipient_id=None),
        CREATOR,
        _days_after_created(3),
        CommitmentStatus.ACTIVE,
        id="goal-active",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.DECLINED),
        CREATOR,
        _days_after_created(3),
        CommitmentStatus.DECLINED,
        id="declined",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.DECLINED),
        RECIPIENT,
        _days_after_created(60),
        CommitmentStatus.DECLINED,
        id="declined-stays-declined-long-after",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.PENDING),
        CREATOR,
        _days_after_created(3),
        CommitmentStatus.SENT,
        id="pending-live-creator-sent",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.PENDING),
        RECIPIENT,
        _days_after_created(3),
        CommitmentStatus.INVITE,
        id="pending-live-recipient-invite",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.PENDING),
        CREATOR,
        _days_after_created(14),
        CommitmentStatus.EXPIRED,
        id="pending-not-live-creator-expired",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.PENDING),
        RECIPIENT,
        _days_after_created(14),
        CommitmentStatus.EXPIRED,
        id="pending-not-live-recipient-expired",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.ACCEPTED, ended_on=STARTS_ON + timedelta(days=5)),
        CREATOR,
        STARTS_ON + timedelta(days=6),
        CommitmentStatus.ENDED_EARLY,
        id="ended-early",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.ACCEPTED),
        CREATOR,
        LAST_DAY,
        CommitmentStatus.ACTIVE,
        id="active-on-last-day",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.ACCEPTED),
        CREATOR,
        END_DATE,
        CommitmentStatus.FINISHED,
        id="finished-on-end-date",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.ACCEPTED),
        RECIPIENT,
        END_DATE + timedelta(days=30),
        CommitmentStatus.FINISHED,
        id="finished-long-after",
    ),
    pytest.param(
        _commitment(invite_status=InviteStatus.ACCEPTED),
        RECIPIENT,
        STARTS_ON,
        CommitmentStatus.ACTIVE,
        id="active",
    ),
]


@pytest.mark.parametrize(("commitment", "viewer_id", "today", "expected"), LADDER_CASES)
def test_derive_status_ladder(
    commitment: Commitment, viewer_id: uuid.UUID, today: date, expected: CommitmentStatus
) -> None:
    assert derive_status(commitment, viewer_id, today) == expected


def test_status_values_are_the_plain_strings() -> None:
    assert [status.value for status in CommitmentStatus] == [
        "declined",
        "sent",
        "invite",
        "expired",
        "ended_early",
        "finished",
        "active",
    ]


# derive_status - the named traps


def test_same_pending_row_is_sent_to_creator_and_invite_to_recipient() -> None:
    commitment = _commitment(invite_status=InviteStatus.PENDING)
    today = _days_after_created(3)

    assert derive_status(commitment, CREATOR, today) == "sent"
    assert derive_status(commitment, RECIPIENT, today) == "invite"


def test_ended_early_wins_once_the_original_end_date_has_also_passed() -> None:
    # The ordering trap: both "ended_on is set" and "past the end date" are
    # true here. Checked the wrong way round, this quit reads as "finished".
    commitment = _commitment(
        invite_status=InviteStatus.ACCEPTED, ended_on=STARTS_ON + timedelta(days=5)
    )

    assert derive_status(commitment, CREATOR, END_DATE + timedelta(days=30)) == "ended_early"


@pytest.mark.parametrize(
    ("viewer_id", "days_since_created", "expected"),
    [
        (CREATOR, 3, CommitmentStatus.SENT),
        (RECIPIENT, 3, CommitmentStatus.INVITE),
        (CREATOR, 20, CommitmentStatus.EXPIRED),
    ],
)
def test_pending_row_without_starts_on_does_not_raise(
    viewer_id: uuid.UUID, days_since_created: int, expected: CommitmentStatus
) -> None:
    # A challenge has no starts_on until it's accepted - the end-date rung is
    # never reached for a pending row, so there's nothing to add weeks to.
    commitment = _commitment(invite_status=InviteStatus.PENDING, starts_on=None)

    assert derive_status(commitment, viewer_id, _days_after_created(days_since_created)) == expected


def test_same_pending_row_changes_status_as_today_moves() -> None:
    # No internal clock read: the row never changes, only `today` does.
    commitment = _commitment(invite_status=InviteStatus.PENDING)

    assert derive_status(commitment, CREATOR, _days_after_created(13)) == "sent"
    assert derive_status(commitment, CREATOR, _days_after_created(14)) == "expired"


def test_same_accepted_row_changes_status_as_today_moves() -> None:
    commitment = _commitment(invite_status=InviteStatus.ACCEPTED)

    assert derive_status(commitment, CREATOR, LAST_DAY) == "active"
    assert derive_status(commitment, CREATOR, END_DATE) == "finished"


# derive_status - impossible challenge rows


@pytest.mark.parametrize("missing_field", ["starts_on", "duration_weeks"])
def test_accepted_challenge_missing_a_term_raises(missing_field: str) -> None:
    commitment = _commitment(invite_status=InviteStatus.ACCEPTED, **{missing_field: None})

    with pytest.raises(ValueError, match=rf"{commitment.id} has no {missing_field}"):
        derive_status(commitment, CREATOR, STARTS_ON)


@pytest.mark.parametrize("missing_field", ["starts_on", "duration_weeks"])
def test_accepted_challenge_missing_a_term_raises_even_when_ended_early(
    missing_field: str,
) -> None:
    # The row is just as invalid with ended_on set - it must not slip out as
    # "ended_early" before the check is reached.
    commitment = _commitment(
        invite_status=InviteStatus.ACCEPTED,
        ended_on=STARTS_ON + timedelta(days=5),
        **{missing_field: None},
    )

    with pytest.raises(ValueError, match=missing_field):
        derive_status(commitment, CREATOR, STARTS_ON + timedelta(days=6))


# derive_status - goals
#
# A goal has no invite_status and no recipient, and goes down the same ladder
# as a challenge: the challenge-only rungs never match it, the shared ones do.

GOAL_ENDED_ON = STARTS_ON + timedelta(days=5)


def _goal(*, duration_weeks: int | None = 4, ended_on: date | None = None) -> Commitment:
    return _commitment(
        invite_status=None, recipient_id=None, duration_weeks=duration_weeks, ended_on=ended_on
    )


def test_ongoing_goal_is_active_and_does_not_raise() -> None:
    # Ongoing is a legitimate goal shape - the impossible-row check above is
    # gated on the row being a challenge, not on duration_weeks being absent.
    # And with no end date, no amount of time makes it "finished".
    goal = _goal(duration_weeks=None)

    assert derive_status(goal, CREATOR, STARTS_ON) == "active"
    assert derive_status(goal, CREATOR, STARTS_ON + timedelta(days=400)) == "active"


def test_fixed_length_goal_past_its_end_date_is_finished() -> None:
    assert derive_status(_goal(), CREATOR, END_DATE + timedelta(days=30)) == "finished"


def test_goal_end_date_bound_matches_a_challenges() -> None:
    # One rule for both row types: active through the last day of the final
    # week, finished from the day after.
    goal = _goal()

    assert derive_status(goal, CREATOR, LAST_DAY) == "active"
    assert derive_status(goal, CREATOR, END_DATE) == "finished"


def test_goal_ended_early_is_ended_early() -> None:
    goal = _goal(ended_on=GOAL_ENDED_ON)

    assert derive_status(goal, CREATOR, GOAL_ENDED_ON + timedelta(days=1)) == "ended_early"


def test_ongoing_goal_ended_early_is_ended_early() -> None:
    goal = _goal(duration_weeks=None, ended_on=GOAL_ENDED_ON)

    assert derive_status(goal, CREATOR, GOAL_ENDED_ON + timedelta(days=400)) == "ended_early"


def test_goal_ended_early_stays_ended_early_once_its_end_date_has_also_passed() -> None:
    # The ordering rung, applying to goals as well: stopping a goal is
    # permanent, it doesn't turn into "finished" by waiting.
    goal = _goal(ended_on=GOAL_ENDED_ON)

    assert derive_status(goal, CREATOR, END_DATE + timedelta(days=30)) == "ended_early"


def test_goal_not_ended_with_its_end_date_ahead_is_active() -> None:
    assert derive_status(_goal(), CREATOR, STARTS_ON + timedelta(days=6)) == "active"


@pytest.mark.parametrize("duration_weeks", [None, 1, 4, 8])
@pytest.mark.parametrize("ended_on", [None, STARTS_ON, GOAL_ENDED_ON])
@pytest.mark.parametrize("viewer_id", [CREATOR, RECIPIENT])
def test_goal_only_ever_has_a_shared_status(
    duration_weeks: int | None, ended_on: date | None, viewer_id: uuid.UUID
) -> None:
    # Every day from creation to well past the longest possible end date -
    # including day 14 on, where a pending challenge would read "expired".
    # "goal" is spelled out too: it isn't a status any more.
    goal = _goal(duration_weeks=duration_weeks, ended_on=ended_on)

    seen = {derive_status(goal, viewer_id, _days_after_created(day)) for day in range(120)}

    assert seen <= {"active", "finished", "ended_early"}
    assert seen.isdisjoint({"goal", "sent", "invite", "declined", "expired"})
