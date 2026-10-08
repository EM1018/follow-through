import uuid
from datetime import date, timedelta

import pytest

from app.models.commitment import Commitment, InviteStatus
from app.models.completion import Completion
from app.services.commitments import BlockStatus, Progress, compute_challenge_progress

CALLER = uuid.uuid4()
OTHER = uuid.uuid4()

STARTS_ON = date(2026, 3, 4)


def _day(offset: int) -> date:
    return STARTS_ON + timedelta(days=offset)


def _challenge(
    *,
    starts_on: date | None = STARTS_ON,
    ended_on: date | None = None,
    sessions_per_week: int = 2,
    duration_weeks: int = 4,
    invite_status: InviteStatus = InviteStatus.ACCEPTED,
) -> Commitment:
    return Commitment(
        creator_id=CALLER,
        recipient_id=OTHER,
        activity="running",
        sessions_per_week=sessions_per_week,
        duration_weeks=duration_weeks,
        starts_on=starts_on,
        ended_on=ended_on,
        invite_status=invite_status,
    )


def _logged(user_id: uuid.UUID, *offsets: int, activity: str = "running") -> list[Completion]:
    return [
        Completion(
            user_id=user_id,
            activity=activity,
            on_date=_day(offset),
            source="standalone",
            label="Test",
        )
        for offset in offsets
    ]


def _counts(progress: Progress) -> list[int]:
    return [block.sessions_done for block in progress.blocks]


def test_each_participants_completions_land_in_the_right_weeks() -> None:
    # Day 16 is in week 3 (days 14-20).
    tracks = compute_challenge_progress(
        _challenge(),
        _logged(CALLER, 0, 1, 8),
        _logged(OTHER, 6, 7, 9, 15),
        today=_day(16),
    )

    assert _counts(tracks.caller) == [2, 1, 0]
    assert _counts(tracks.other) == [1, 2, 1]


def test_both_tracks_share_one_set_of_week_boundaries() -> None:
    tracks = compute_challenge_progress(
        _challenge(), _logged(CALLER, 0, 8), _logged(OTHER, 15), today=_day(16)
    )

    def bounds(progress: Progress) -> list[tuple[int, date, date]]:
        return [(b.index, b.starts_on, b.ends_on) for b in progress.blocks]

    assert bounds(tracks.caller) == bounds(tracks.other)
    assert bounds(tracks.caller) == [
        (0, _day(0), _day(6)),
        (1, _day(7), _day(13)),
        (2, _day(14), _day(20)),
    ]
    assert tracks.caller.weeks_total == tracks.other.weeks_total == 4


def test_one_participants_completion_does_not_show_in_the_others_track() -> None:
    tracks = compute_challenge_progress(_challenge(), _logged(CALLER, 0, 1), [], today=_day(3))

    assert _counts(tracks.caller) == [2]
    assert _counts(tracks.other) == [0]


def test_only_one_participant_logging_gives_real_counts_and_zeros() -> None:
    tracks = compute_challenge_progress(
        _challenge(), [], _logged(OTHER, 0, 1, 7, 8, 14), today=_day(16)
    )

    assert _counts(tracks.other) == [2, 2, 1]
    assert tracks.other.weeks_passed == 2
    assert tracks.other.current_streak == 2
    assert _counts(tracks.caller) == [0, 0, 0]
    assert tracks.caller.weeks_passed == 0
    assert tracks.caller.current_streak == 0


def test_unreached_weeks_are_absent_not_missed() -> None:
    # Day 9: week 1 is over, week 2 is open, weeks 3 and 4 haven't happened.
    tracks = compute_challenge_progress(_challenge(), [], [], today=_day(9))

    for progress in (tracks.caller, tracks.other):
        # A week nobody trained in is "missed" once it's over...
        assert [block.status for block in progress.blocks] == [
            BlockStatus.MISSED,
            BlockStatus.IN_PROGRESS,
        ]
        # ...but the two still to come aren't blocks at all. weeks_total is
        # what says they exist.
        assert [block.index for block in progress.blocks] == [0, 1]
        assert progress.weeks_total == 4


def test_a_quit_drops_the_partial_final_week_from_both_tracks() -> None:
    # Quit on day 9, partway through week 2. Both had sessions in that week.
    tracks = compute_challenge_progress(
        _challenge(ended_on=_day(9)),
        _logged(CALLER, 0, 1, 7, 8),
        _logged(OTHER, 2, 8),
        today=_day(30),
    )

    assert _counts(tracks.caller) == [2]
    assert _counts(tracks.other) == [1]
    assert tracks.caller.weeks_total == tracks.other.weeks_total == 1


def test_a_completion_before_starts_on_counts_toward_neither_track() -> None:
    tracks = compute_challenge_progress(
        _challenge(), _logged(CALLER, -1, -7), _logged(OTHER, -1), today=_day(3)
    )

    assert _counts(tracks.caller) == [0]
    assert _counts(tracks.other) == [0]


def test_another_activity_counts_toward_neither_track() -> None:
    tracks = compute_challenge_progress(
        _challenge(),
        _logged(CALLER, 0, 1, activity="cycling"),
        _logged(OTHER, 0, activity="cycling") + _logged(OTHER, 1),
        today=_day(3),
    )

    assert _counts(tracks.caller) == [0]
    assert _counts(tracks.other) == [1]


@pytest.mark.parametrize("invite_status", [InviteStatus.PENDING, InviteStatus.DECLINED])
def test_a_challenge_with_no_starts_on_is_refused_not_answered_with_zeros(
    invite_status: InviteStatus,
) -> None:
    # Callers branch on starts_on first. Getting here without one is a bug in
    # the caller, and an empty result would hide it.
    challenge = _challenge(starts_on=None, invite_status=invite_status)

    with pytest.raises(ValueError, match="no starts_on"):
        compute_challenge_progress(challenge, [], [], today=_day(3))
