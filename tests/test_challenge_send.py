import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.commitment import Commitment, InviteStatus
from app.models.user import User
from app.routers.commitments import DUPLICATE_CHALLENGE, USERNAME_REQUIRED
from app.services.commitments import INVITE_LIVE_DAYS

SENDER_USERNAME = "sender_one"
RECIPIENT_USERNAME = "TestUser"


def _switch_user(user: CurrentUser) -> None:
    """Reassign the shared get_current_user override to act as a different user
    (see second_user fixture in conftest.py for why this is a reassignment, not a
    second client).
    """
    app.dependency_overrides[get_current_user] = lambda: user


def _challenge_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "activity": "running",
        "sessions_per_week": 3,
        "duration_weeks": 4,
        "recipient_username": RECIPIENT_USERNAME,
    }
    payload.update(overrides)
    return payload


async def _set_username(session: AsyncSession, user_id: uuid.UUID, username: str | None) -> None:
    user = await session.get(User, user_id)
    assert user is not None
    user.username = username
    session.add(user)
    await session.commit()


async def _update_commitment(session: AsyncSession, commitment_id: str, **fields: Any) -> None:
    """Reaches past the API to put a row in a state no endpoint can produce
    yet (accept and decline are later increments) or that would otherwise
    take two weeks to arrive (expiry).
    """
    commitment = await session.get(Commitment, uuid.UUID(commitment_id))
    assert commitment is not None
    for name, value in fields.items():
        setattr(commitment, name, value)
    session.add(commitment)
    await session.commit()


@pytest.fixture
async def pair(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    session: AsyncSession,
) -> tuple[AsyncClient, CurrentUser, CurrentUser]:
    """Two users who can challenge each other: both named, acting as the first."""
    client, me = authed_client
    await _set_username(session, me.user_id, SENDER_USERNAME)
    await _set_username(session, second_user.user_id, RECIPIENT_USERNAME)
    return client, me, second_user


async def test_challenge_is_created_pending_and_not_started(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser],
) -> None:
    client, me, them = pair

    response = await client.post("/commitments", json=_challenge_payload())

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["creator_id"] == str(me.user_id)
    assert body["recipient_id"] == str(them.user_id)
    assert body["invite_status"] == "pending"
    # The clock starts at accept, not send.
    assert body["starts_on"] is None
    assert body["duration_weeks"] == 4
    assert body["progress"] == {
        "blocks": [],
        "current_streak": 0,
        "longest_streak": 0,
        "weeks_passed": 0,
        "weeks_total": 4,
    }


async def test_goal_creation_is_unchanged_without_recipient_username(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser],
) -> None:
    client, _me, _them = pair
    payload = _challenge_payload()
    del payload["recipient_username"]

    response = await client.post("/commitments", json=payload)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["recipient_id"] is None
    assert body["invite_status"] is None
    assert body["starts_on"] is not None


async def test_ongoing_goal_creation_still_works(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    # No username on purpose - the sender gate is a challenge rule only.
    client, _me = authed_client

    response = await client.post(
        "/commitments",
        json={"activity": "running", "sessions_per_week": 3, "duration_weeks": None},
    )

    assert response.status_code == 201, response.text
    assert response.json()["duration_weeks"] is None


@pytest.mark.parametrize("typed", ["testuser", "TESTUSER", "TestUser"])
async def test_recipient_lookup_is_case_insensitive(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser], typed: str
) -> None:
    client, _me, them = pair

    response = await client.post("/commitments", json=_challenge_payload(recipient_username=typed))

    assert response.status_code == 201, response.text
    assert response.json()["recipient_id"] == str(them.user_id)


async def test_unknown_username_is_404(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser],
) -> None:
    client, _me, _them = pair

    response = await client.post(
        "/commitments", json=_challenge_payload(recipient_username="nobody_here")
    )

    assert response.status_code == 404


@pytest.mark.parametrize("typed", [SENDER_USERNAME, SENDER_USERNAME.upper()])
async def test_self_challenge_is_rejected(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser], typed: str
) -> None:
    client, _me, _them = pair

    response = await client.post("/commitments", json=_challenge_payload(recipient_username=typed))

    assert response.status_code == 422
    assert response.json()["detail"] == "You cannot challenge yourself"


async def test_sender_without_username_gets_the_soft_gate_code(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser], session: AsyncSession
) -> None:
    client, me, _them = pair
    await _set_username(session, me.user_id, None)

    response = await client.post("/commitments", json=_challenge_payload())

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == USERNAME_REQUIRED


@pytest.mark.parametrize("duration_weeks", [0, 9, None])
async def test_challenge_duration_must_be_one_to_eight_weeks(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser], duration_weeks: int | None
) -> None:
    client, _me, _them = pair

    response = await client.post(
        "/commitments", json=_challenge_payload(duration_weeks=duration_weeks)
    )

    assert response.status_code == 422


async def test_pending_challenge_blocks_a_second_send(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser],
) -> None:
    client, _me, _them = pair
    first = await client.post("/commitments", json=_challenge_payload())
    assert first.status_code == 201, first.text

    response = await client.post("/commitments", json=_challenge_payload())

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == DUPLICATE_CHALLENGE


async def test_pending_challenge_blocks_the_reverse_send(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser],
) -> None:
    client, _me, them = pair
    first = await client.post("/commitments", json=_challenge_payload())
    assert first.status_code == 201, first.text

    _switch_user(them)
    response = await client.post(
        "/commitments", json=_challenge_payload(recipient_username=SENDER_USERNAME)
    )

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == DUPLICATE_CHALLENGE


async def test_pending_challenge_does_not_block_a_different_activity(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser],
) -> None:
    client, _me, _them = pair
    first = await client.post("/commitments", json=_challenge_payload())
    assert first.status_code == 201, first.text

    response = await client.post("/commitments", json=_challenge_payload(activity="cycling"))

    assert response.status_code == 201, response.text


async def test_expired_pending_challenge_does_not_block_a_new_send(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser], session: AsyncSession
) -> None:
    client, _me, _them = pair
    first = await client.post("/commitments", json=_challenge_payload())
    assert first.status_code == 201, first.text
    await _update_commitment(
        session,
        first.json()["id"],
        created_at=datetime.now(UTC) - timedelta(days=INVITE_LIVE_DAYS + 1),
    )

    response = await client.post("/commitments", json=_challenge_payload())

    assert response.status_code == 201, response.text


async def test_declined_challenge_does_not_block_a_new_send(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser], session: AsyncSession
) -> None:
    client, _me, _them = pair
    first = await client.post("/commitments", json=_challenge_payload())
    assert first.status_code == 201, first.text
    await _update_commitment(session, first.json()["id"], invite_status=InviteStatus.DECLINED)

    response = await client.post("/commitments", json=_challenge_payload())

    assert response.status_code == 201, response.text


async def test_active_challenge_blocks_a_new_send(
    pair: tuple[AsyncClient, CurrentUser, CurrentUser], session: AsyncSession
) -> None:
    """The other half of the rule: an accepted challenge still running blocks
    just like a pending one does.
    """
    client, _me, _them = pair
    first = await client.post("/commitments", json=_challenge_payload())
    assert first.status_code == 201, first.text
    await _update_commitment(
        session,
        first.json()["id"],
        invite_status=InviteStatus.ACCEPTED,
        starts_on=datetime.now(UTC).date(),
    )

    response = await client.post("/commitments", json=_challenge_payload())

    assert response.status_code == 409
    assert response.json()["detail"]["code"] == DUPLICATE_CHALLENGE
