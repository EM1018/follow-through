import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any

import pytest

from app.models.commitment import Commitment, InviteStatus
from app.models.completion import Completion
from app.routers.commitments import CompletionsByOwner, _oriented_read
from app.schemas.commitment import OrientedCommitmentRead, ThemRead, TrackRead, WeekRead

CREATOR = uuid.uuid4()
RECIPIENT = uuid.uuid4()
USERNAMES: dict[uuid.UUID, str | None] = {CREATOR: "creator_name", RECIPIENT: "recipient_name"}

CREATED_ON = date(2026, 3, 2)
STARTS_ON = date(2026, 3, 4)

TERMS = {
    "id",
    "status",
    "activity",
    "target_value",
    "target_unit",
    "sessions_per_week",
    "duration_weeks",
    "created_at",
}
TRACK_KEYS = {"weeks", "weeks_total", "weeks_passed", "current_streak", "longest_streak"}
WEEK_KEYS = {"index", "sessions_done", "met", "in_progress"}


def _day(offset: int) -> date:
    return STARTS_ON + timedelta(days=offset)


def _commitment(
    *,
    recipient_id: uuid.UUID | None = RECIPIENT,
    invite_status: InviteStatus | None = InviteStatus.ACCEPTED,
    starts_on: date | None = STARTS_ON,
    ended_on: date | None = None,
    ended_by_id: uuid.UUID | None = None,
    duration_weeks: int | None = 4,
) -> Commitment:
    return Commitment(
        creator_id=CREATOR,
        recipient_id=recipient_id,
        activity="running",
        sessions_per_week=2,
        duration_weeks=duration_weeks,
        starts_on=starts_on,
        ended_on=ended_on,
        ended_by_id=ended_by_id,
        invite_status=invite_status,
        created_at=datetime(CREATED_ON.year, CREATED_ON.month, CREATED_ON.day, 12, tzinfo=UTC),
    )


def _goal(**overrides: Any) -> Commitment:
    return _commitment(recipient_id=None, invite_status=None, **overrides)


def _logged(
    *, creator: tuple[int, ...] = (), recipient: tuple[int, ...] = ()
) -> CompletionsByOwner:
    return {
        (user_id, "running"): [
            Completion(
                user_id=user_id,
                activity="running",
                on_date=_day(offset),
                source="standalone",
                label="Test",
            )
            for offset in offsets
        ]
        for user_id, offsets in ((CREATOR, creator), (RECIPIENT, recipient))
    }


def _json(
    commitment: Commitment,
    viewer_id: uuid.UUID,
    today: date,
    completions: CompletionsByOwner | None = None,
) -> dict[str, Any]:
    """What goes over the wire - the serialized form, not the model."""
    read = _oriented_read(commitment, viewer_id, today, completions or {}, USERNAMES)
    return read.model_dump(mode="json")


# orientation


def test_each_participant_is_you_and_the_other_is_them() -> None:
    challenge = _commitment()
    completions = _logged(creator=(0, 1, 8), recipient=(7,))

    as_creator = _json(challenge, CREATOR, _day(9), completions)
    as_recipient = _json(challenge, RECIPIENT, _day(9), completions)

    assert as_creator["them"]["username"] == "recipient_name"
    assert as_recipient["them"]["username"] == "creator_name"
    assert [week["sessions_done"] for week in as_creator["you"]["weeks"]] == [2, 1]
    assert [week["sessions_done"] for week in as_recipient["you"]["weeks"]] == [0, 1]


def test_both_views_hold_the_same_tracks_under_swapped_labels() -> None:
    challenge = _commitment()
    completions = _logged(creator=(0, 1, 8), recipient=(7,))

    as_creator = _json(challenge, CREATOR, _day(9), completions)
    as_recipient = _json(challenge, RECIPIENT, _day(9), completions)

    assert as_creator["you"] == as_recipient["them"]["track"]
    assert as_creator["them"]["track"] == as_recipient["you"]
    # Everything that isn't about who's looking is identical.
    for field in TERMS - {"status"} | {"starts_on"}:
        assert as_creator[field] == as_recipient[field]


@pytest.mark.parametrize("quitter", [CREATOR, RECIPIENT])
def test_ended_by_says_you_to_the_quitter_and_them_to_the_other(quitter: uuid.UUID) -> None:
    challenge = _commitment(ended_on=_day(9), ended_by_id=quitter)
    other = RECIPIENT if quitter == CREATOR else CREATOR

    assert _json(challenge, quitter, _day(20))["ended_by"] == "you"
    assert _json(challenge, other, _day(20))["ended_by"] == "them"
    assert _json(challenge, other, _day(20))["ended_on"] == _day(9).isoformat()


def test_a_non_participant_cannot_be_given_a_view() -> None:
    with pytest.raises(ValueError, match="not a participant"):
        _json(_commitment(), uuid.uuid4(), _day(3))


# absent versus empty - asserted on the serialized keys, so "sent as null" or
# "sent as []" fails the same way a wrong value would


@pytest.mark.parametrize(
    ("invite_status", "days_since_created", "viewer_id", "expected_status"),
    [
        (InviteStatus.PENDING, 3, CREATOR, "sent"),
        (InviteStatus.PENDING, 3, RECIPIENT, "invite"),
        (InviteStatus.PENDING, 20, CREATOR, "expired"),
        (InviteStatus.DECLINED, 3, CREATOR, "declined"),
    ],
)
def test_a_challenge_that_never_started_has_terms_and_a_name_and_nothing_else(
    invite_status: InviteStatus,
    days_since_created: int,
    viewer_id: uuid.UUID,
    expected_status: str,
) -> None:
    challenge = _commitment(invite_status=invite_status, starts_on=None)
    # Logged by both, on days that would count if anything looked.
    completions = _logged(creator=(0, 1), recipient=(0,))

    body = _json(challenge, viewer_id, CREATED_ON + timedelta(days=days_since_created), completions)

    assert body["status"] == expected_status
    # No starts_on, no `you`, no ended_on, no ended_by - not even as null.
    assert set(body) == TERMS | {"them"}
    # Who it's with, so the card can say - but no track for them either.
    assert set(body["them"]) == {"username"}


@pytest.mark.parametrize("today_offset", [3, 40], ids=["active", "finished"])
def test_a_running_or_finished_challenge_has_both_tracks_and_no_ending(today_offset: int) -> None:
    body = _json(_commitment(), RECIPIENT, _day(today_offset))

    assert set(body) == TERMS | {"starts_on", "you", "them"}
    assert set(body["them"]) == {"username", "track"}
    assert set(body["you"]) == set(body["them"]["track"]) == TRACK_KEYS


def test_an_ended_early_challenge_adds_when_and_by_whom() -> None:
    body = _json(_commitment(ended_on=_day(9), ended_by_id=CREATOR), RECIPIENT, _day(10))

    assert body["status"] == "ended_early"
    assert set(body) == TERMS | {"starts_on", "you", "them", "ended_on", "ended_by"}


def test_an_unreached_week_is_left_out_while_a_failed_one_is_listed() -> None:
    # Day 9 of 4 weeks: week 1 closed with nothing in it, week 2 is open,
    # weeks 3 and 4 haven't come.
    track = _json(_commitment(), CREATOR, _day(9))["you"]

    assert track["weeks"] == [
        {"index": 0, "sessions_done": 0, "met": False, "in_progress": False},
        {"index": 1, "sessions_done": 0, "met": False, "in_progress": True},
    ]
    # Two listed, four in all: the other two are still to come, not failed.
    assert track["weeks_total"] == 4


def test_a_met_week_is_met_even_while_it_is_still_open() -> None:
    track = _json(_commitment(), CREATOR, _day(2), _logged(creator=(0, 1)))["you"]

    assert track["weeks"] == [{"index": 0, "sessions_done": 2, "met": True, "in_progress": False}]


# goals - the same envelope


def test_a_goal_has_you_and_no_them() -> None:
    body = _json(_goal(), CREATOR, _day(3), _logged(creator=(0,)))

    assert set(body) == TERMS | {"starts_on", "you"}
    assert set(body["you"]) == TRACK_KEYS
    assert [week["sessions_done"] for week in body["you"]["weeks"]] == [1]


def test_an_ongoing_goal_sends_duration_weeks_as_null_not_absent() -> None:
    # The one null that means something: no end date. Present, unlike a field
    # that doesn't apply.
    body = _json(_goal(duration_weeks=None), CREATOR, _day(3))

    assert "duration_weeks" in body
    assert body["duration_weeks"] is None


def test_a_goal_ended_early_was_ended_by_you() -> None:
    body = _json(_goal(ended_on=_day(9)), CREATOR, _day(10))

    assert set(body) == TERMS | {"starts_on", "you", "ended_on", "ended_by"}
    assert body["ended_by"] == "you"


# the privacy boundary


def test_week_fields_are_exactly_a_count_and_how_the_week_stands() -> None:
    body = _json(_commitment(), CREATOR, _day(9), _logged(creator=(0,), recipient=(1,)))

    for track in (body["you"], body["them"]["track"]):
        assert track["weeks"]
        for week in track["weeks"]:
            assert set(week) == WEEK_KEYS


def test_response_models_declare_exactly_the_fields_listed_here() -> None:
    # A field added to any of these has to be added here too - which is the
    # moment to ask whether it should be leaving the server.
    assert set(WeekRead.model_fields) == WEEK_KEYS
    assert set(TrackRead.model_fields) == TRACK_KEYS
    assert set(ThemRead.model_fields) == {"username", "track"}
    assert set(OrientedCommitmentRead.model_fields) == TERMS | {
        "starts_on",
        "you",
        "them",
        "ended_on",
        "ended_by",
    }


def test_response_models_never_read_fields_off_an_object() -> None:
    for model in (WeekRead, TrackRead, ThemRead, OrientedCommitmentRead):
        assert not model.model_config.get("from_attributes")


def test_nothing_of_a_completion_beyond_the_count_is_in_the_response() -> None:
    completions: CompletionsByOwner = {
        (user_id, "running"): [
            Completion(
                user_id=user_id,
                activity="running",
                value=Decimal("7.77"),
                unit="miles",
                on_date=_day(1),
                source="standalone",
                label=f"LABEL-OF-{name}",
                note=f"NOTE-OF-{name}",
                schedule_entry_id=uuid.uuid4(),
            )
        ]
        for user_id, name in ((CREATOR, "CREATOR"), (RECIPIENT, "RECIPIENT"))
    }
    rows = [row for owned in completions.values() for row in owned]

    for viewer_id in (CREATOR, RECIPIENT):
        read = _oriented_read(_commitment(), viewer_id, _day(9), completions, USERNAMES)
        wire = read.model_dump_json()

        assert '"sessions_done":1' in wire  # they were counted...
        for row in rows:  # ...and that is all that got out
            assert str(row.id) not in wire
            assert str(row.user_id) not in wire
            assert str(row.schedule_entry_id) not in wire
            assert row.on_date.isoformat() not in wire
            assert row.label not in wire
            assert str(row.note) not in wire
        assert "7.77" not in wire
        assert "miles" not in wire
        assert "standalone" not in wire


def test_a_field_added_to_completions_does_not_reach_the_response() -> None:
    # Stands in for a new column: every completion carries a value the
    # response models have never heard of.
    completions = _logged(creator=(0, 1), recipient=(1,))
    for owned in completions.values():
        for row in owned:
            object.__setattr__(row, "heart_rate", "LEAKED-NEW-COLUMN")

    for viewer_id in (CREATOR, RECIPIENT):
        read = _oriented_read(_commitment(), viewer_id, _day(9), completions, USERNAMES)

        assert "LEAKED-NEW-COLUMN" not in read.model_dump_json()
        assert "heart_rate" not in read.model_dump_json()


def test_commitment_columns_nobody_exposed_do_not_reach_the_response() -> None:
    # The same guarantee for the commitment's own row: these columns exist
    # and are populated, and the builder never named them.
    challenge = _commitment(ended_on=_day(9), ended_by_id=RECIPIENT)
    challenge.rematch_of_id = uuid.uuid4()

    wire = _oriented_read(challenge, CREATOR, _day(10), {}, USERNAMES).model_dump_json()

    for hidden in (challenge.creator_id, challenge.recipient_id, challenge.rematch_of_id):
        assert str(hidden) not in wire
    for name in ("creator_id", "recipient_id", "ended_by_id", "rematch_of_id", "invite_status"):
        assert name not in wire
