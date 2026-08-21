import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import patch
from uuid import uuid4

from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.commitment import Commitment
from app.models.completion import Completion
from app.models.user import User
from app.services import dates


def _switch_user(user: CurrentUser) -> None:
    """Reassign the shared get_current_user override to act as a different user
    (see second_user fixture in conftest.py for why this is a reassignment, not a
    second client).
    """
    app.dependency_overrides[get_current_user] = lambda: user


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


def _commitment_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "activity": "running",
        "target_value": 15,
        "target_unit": "minutes",
        "sessions_per_week": 3,
        "duration_weeks": None,
    }
    payload.update(overrides)
    return payload


def _completion_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "activity": "running",
        "value": 20,
        "unit": "minutes",
        "on_date": _today(),
    }
    payload.update(overrides)
    return payload


async def test_create_goal_with_target(authed_client: tuple[AsyncClient, CurrentUser]) -> None:
    client, _me = authed_client
    response = await client.post("/commitments", json=_commitment_payload())

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["activity"] == "running"
    assert body["target_value"] == 15
    assert body["target_unit"] == "minutes"
    assert body["sessions_per_week"] == 3
    assert body["duration_weeks"] is None
    assert body["recipient_id"] is None
    assert body["invite_status"] is None
    # A goal always starts today, so its first (in-progress) block exists
    # immediately - "empty" means zero sessions logged so far, not zero blocks.
    assert body["progress"]["blocks"] == [
        {
            "index": 0,
            "starts_on": _today(),
            "ends_on": body["progress"]["blocks"][0]["ends_on"],
            "sessions_done": 0,
            "sessions_required": 3,
            "status": "in_progress",
        }
    ]
    assert body["progress"]["current_streak"] == 0
    assert body["progress"]["longest_streak"] == 0
    assert body["progress"]["weeks_passed"] == 0


async def test_starts_on_uses_the_users_own_timezone_not_utc(
    authed_client: tuple[AsyncClient, CurrentUser],
    session: AsyncSession,
) -> None:
    """The permanent-damage case: starts_on is written once at creation, so a
    wrong UTC date here would stick forever, not just be wrong for a day.
    """
    client, me = authed_client
    user = await session.get(User, me.user_id)
    user.timezone = "America/Los_Angeles"
    session.add(user)
    await session.commit()

    # 2026-08-09 02:00 UTC = 2026-08-08 19:00 in Los Angeles (PDT, UTC-7).
    instant = datetime(2026, 8, 9, 2, 0, tzinfo=UTC)

    with patch.object(dates, "_now", return_value=instant):
        response = await client.post("/commitments", json=_commitment_payload())

    assert response.status_code == 201, response.text
    assert response.json()["starts_on"] == "2026-08-08"


async def test_create_goal_with_no_target(authed_client: tuple[AsyncClient, CurrentUser]) -> None:
    client, _me = authed_client
    payload = _commitment_payload()
    del payload["target_value"]
    del payload["target_unit"]

    response = await client.post("/commitments", json=payload)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["target_value"] is None
    assert body["target_unit"] is None


async def test_target_value_without_target_unit_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    payload = _commitment_payload()
    del payload["target_unit"]

    response = await client.post("/commitments", json=payload)
    assert response.status_code == 422


async def test_target_unit_without_target_value_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    payload = _commitment_payload()
    del payload["target_value"]

    response = await client.post("/commitments", json=payload)
    assert response.status_code == 422


async def test_target_unit_not_permitted_for_activity_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    # strength_training only permits minutes/hours/sets/reps - miles isn't one.
    payload = _commitment_payload(
        activity="strength_training", target_value=5, target_unit="miles"
    )

    response = await client.post("/commitments", json=payload)
    assert response.status_code == 422


async def test_sessions_per_week_zero_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.post("/commitments", json=_commitment_payload(sessions_per_week=0))
    assert response.status_code == 422


async def test_sessions_per_week_eight_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.post("/commitments", json=_commitment_payload(sessions_per_week=8))
    assert response.status_code == 422


async def test_duration_weeks_nine_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.post("/commitments", json=_commitment_payload(duration_weeks=9))
    assert response.status_code == 422


async def test_sending_recipient_id_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    response = await client.post(
        "/commitments", json=_commitment_payload(recipient_id=str(uuid4()))
    )
    assert response.status_code == 422


async def test_sending_starts_on_is_422(authed_client: tuple[AsyncClient, CurrentUser]) -> None:
    client, _me = authed_client
    response = await client.post("/commitments", json=_commitment_payload(starts_on=_today()))
    assert response.status_code == 422


async def test_list_commitments_returns_only_my_goals(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client

    mine = await client.post("/commitments", json=_commitment_payload())
    assert mine.status_code == 201
    my_id = mine.json()["id"]

    _switch_user(second_user)
    theirs = await client.post("/commitments", json=_commitment_payload())
    assert theirs.status_code == 201
    their_id = theirs.json()["id"]

    _switch_user(me)
    listing = await client.get("/commitments")
    assert listing.status_code == 200
    body = listing.json()
    ids = {c["id"] for c in body["active"]} | {c["id"] for c in body["finished"]}
    assert my_id in ids
    assert their_id not in ids


async def test_get_other_users_commitment_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client
    created = await client.post("/commitments", json=_commitment_payload())
    commitment_id = created.json()["id"]

    _switch_user(second_user)
    response = await client.get(f"/commitments/{commitment_id}")
    assert response.status_code == 404

    _switch_user(me)


async def test_delete_other_users_commitment_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client
    created = await client.post("/commitments", json=_commitment_payload())
    commitment_id = created.json()["id"]

    _switch_user(second_user)
    response = await client.delete(f"/commitments/{commitment_id}")
    assert response.status_code == 404

    _switch_user(me)


async def test_delete_goal_with_matching_completions_keeps_completions(
    authed_client: tuple[AsyncClient, CurrentUser], session: AsyncSession
) -> None:
    client, me = authed_client
    created = await client.post("/commitments", json=_commitment_payload())
    commitment_id = created.json()["id"]

    completion = await client.post("/completions", json=_completion_payload())
    assert completion.status_code == 201, completion.text
    completion_id = completion.json()["id"]

    response = await client.delete(f"/commitments/{commitment_id}")
    assert response.status_code == 204

    result = await session.exec(select(Completion).where(Completion.id == completion_id))
    assert result.one().user_id == me.user_id


async def test_logged_completions_feed_goal_progress(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    created = await client.post(
        "/commitments",
        json=_commitment_payload(
            activity="running", target_value=3, target_unit="miles", sessions_per_week=2
        ),
    )
    commitment_id = created.json()["id"]

    logged = await client.post(
        "/completions",
        json=_completion_payload(activity="running", value=5, unit="miles"),
    )
    assert logged.status_code == 201, logged.text

    response = await client.get(f"/commitments/{commitment_id}")
    assert response.status_code == 200
    blocks = response.json()["progress"]["blocks"]
    assert len(blocks) == 1
    assert blocks[0]["sessions_done"] == 1


async def test_non_matching_completion_is_excluded_from_progress(
    authed_client: tuple[AsyncClient, CurrentUser], session: AsyncSession
) -> None:
    """Isolated from the matching case (a different completion, not a second
    one alongside a matching completion on the same day) - two same-day
    completions would both collapse into the same one qualifying day whether
    or not the matcher is broken, which would prove nothing. A matcher that
    wrongly credits everything looks identical to a working one unless
    something is deliberately excluded and checked on its own.
    """
    client, me = authed_client
    created = await client.post(
        "/commitments",
        json=_commitment_payload(
            activity="running", target_value=3, target_unit="miles", sessions_per_week=2
        ),
    )
    commitment_id = created.json()["id"]

    # wrong activity, otherwise a perfectly qualifying value
    not_matching = await client.post(
        "/completions",
        json=_completion_payload(activity="cycling", value=5, unit="miles"),
    )
    assert not_matching.status_code == 201, not_matching.text
    not_matching_id = not_matching.json()["id"]

    response = await client.get(f"/commitments/{commitment_id}")
    assert response.status_code == 200
    blocks = response.json()["progress"]["blocks"]
    assert blocks[0]["sessions_done"] == 0

    result = await session.exec(select(Completion).where(Completion.id == not_matching_id))
    assert result.one().user_id == me.user_id


# Ending a goal


async def test_end_ongoing_goal_sets_ended_on_and_moves_it_to_finished(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    created = await client.post("/commitments", json=_commitment_payload())
    commitment_id = created.json()["id"]

    response = await client.post(f"/commitments/{commitment_id}/end")
    assert response.status_code == 200, response.text
    assert response.json()["ended_on"] == _today()

    listing = await client.get("/commitments")
    finished_ids = {c["id"] for c in listing.json()["finished"]}
    active_ids = {c["id"] for c in listing.json()["active"]}
    assert commitment_id in finished_ids
    assert commitment_id not in active_ids


async def test_ending_a_fixed_length_goal_early_works_the_same_way(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    created = await client.post(
        "/commitments", json=_commitment_payload(duration_weeks=8)
    )
    commitment_id = created.json()["id"]

    response = await client.post(f"/commitments/{commitment_id}/end")
    assert response.status_code == 200, response.text
    assert response.json()["ended_on"] == _today()


async def test_ending_an_already_ended_goal_is_409(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    created = await client.post("/commitments", json=_commitment_payload())
    commitment_id = created.json()["id"]

    first = await client.post(f"/commitments/{commitment_id}/end")
    assert first.status_code == 200, first.text

    second = await client.post(f"/commitments/{commitment_id}/end")
    assert second.status_code == 409


async def test_ending_another_users_goal_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client
    created = await client.post("/commitments", json=_commitment_payload())
    commitment_id = created.json()["id"]

    _switch_user(second_user)
    response = await client.post(f"/commitments/{commitment_id}/end")
    assert response.status_code == 404

    _switch_user(me)


async def test_ending_a_goal_already_finished_by_duration_is_409(
    authed_client: tuple[AsyncClient, CurrentUser], session: AsyncSession
) -> None:
    client, _me = authed_client
    created = await client.post(
        "/commitments", json=_commitment_payload(duration_weeks=1)
    )
    commitment_id = created.json()["id"]

    # Force it into "already finished" territory - duration_weeks=1 means the
    # single block's last day is starts_on + 6; back-date starts_on so that's
    # already in the past, the same way _is_finished checks it.
    commitment = await session.get(Commitment, uuid.UUID(commitment_id))
    commitment.starts_on = commitment.starts_on - timedelta(days=30)
    session.add(commitment)
    await session.commit()

    response = await client.post(f"/commitments/{commitment_id}/end")
    assert response.status_code == 409


async def test_ending_does_not_touch_completions(
    authed_client: tuple[AsyncClient, CurrentUser], session: AsyncSession
) -> None:
    client, _me = authed_client
    created = await client.post("/commitments", json=_commitment_payload())
    commitment_id = created.json()["id"]

    logged = await client.post("/completions", json=_completion_payload())
    completion_id = logged.json()["id"]

    response = await client.post(f"/commitments/{commitment_id}/end")
    assert response.status_code == 200, response.text

    result = await session.exec(select(Completion).where(Completion.id == completion_id))
    completion = result.one()
    assert completion.on_date == date.fromisoformat(_today())


async def test_ending_does_not_change_duration_weeks(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    created = await client.post(
        "/commitments", json=_commitment_payload(duration_weeks=8)
    )
    commitment_id = created.json()["id"]

    response = await client.post(f"/commitments/{commitment_id}/end")
    assert response.status_code == 200, response.text
    assert response.json()["duration_weeks"] == 8
