import asyncio
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import patch

import pytest
from fastapi import Header
from httpx import AsyncClient, Response
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.commitment import Commitment, InviteStatus
from app.models.completion import Completion
from app.models.user import User
from app.routers import commitments as commitments_router
from app.routers.commitments import (
    CHALLENGE_ALREADY_ACCEPTED,
    CHALLENGE_CAP_REACHED,
    INVITE_EXPIRED,
    INVITE_NOT_PENDING,
    INVITE_UNAVAILABLE,
)
from app.services import dates
from app.services.commitments import CHALLENGE_CAP, INVITE_LIVE_DAYS
from tests.conftest import test_session_maker as session_maker

SENDER_USERNAME = "sender_one"
RECIPIENT_USERNAME = "recipient_one"

# Activities for rows inserted straight into the table. The invite under test
# is always "running", so these never collide with it.
_FILLER_ACTIVITIES = ["walking", "cycling", "swimming", "cardio", "other"]


@dataclass
class Invite:
    """A live pending invite from `sender` to `recipient`, with `sender` as
    the acting user until a test switches.
    """

    client: AsyncClient
    sender: CurrentUser
    recipient: CurrentUser
    id: str


def _switch_user(user: CurrentUser) -> None:
    """Reassign the shared get_current_user override to act as a different user
    (see second_user fixture in conftest.py for why this is a reassignment, not a
    second client).
    """
    app.dependency_overrides[get_current_user] = lambda: user


def _today() -> date:
    return datetime.now(UTC).date()


def _code(response: Response) -> str:
    return response.json()["detail"]["code"]


async def _set_username(session: AsyncSession, user_id: uuid.UUID, username: str) -> None:
    user = await session.get(User, user_id)
    assert user is not None
    user.username = username
    session.add(user)
    await session.commit()


async def _send(
    client: AsyncClient, *, headers: dict[str, str] | None = None, **overrides: Any
) -> str:
    payload: dict[str, Any] = {
        "activity": "running",
        "sessions_per_week": 3,
        "duration_weeks": 4,
        "recipient_username": RECIPIENT_USERNAME,
    }
    payload.update(overrides)
    response = await client.post("/commitments", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _fetch(commitment_id: str) -> Commitment | None:
    """A fresh session every time - the shared `session` fixture would hand
    back whatever it cached before the API changed the row.
    """
    async with session_maker() as fresh:
        return await fresh.get(Commitment, uuid.UUID(commitment_id))


async def _update_commitment(session: AsyncSession, commitment_id: str, **fields: Any) -> None:
    """Reaches past the API for states that would otherwise take weeks to
    arrive (expiry).
    """
    commitment = await session.get(Commitment, uuid.UUID(commitment_id))
    assert commitment is not None
    for name, value in fields.items():
        setattr(commitment, name, value)
    session.add(commitment)
    await session.commit()


async def _expire(session: AsyncSession, commitment_id: str) -> None:
    await _update_commitment(
        session,
        commitment_id,
        created_at=datetime.now(UTC) - timedelta(days=INVITE_LIVE_DAYS + 1),
    )


async def _insert_challenge(
    session: AsyncSession,
    *,
    creator_id: uuid.UUID,
    recipient_id: uuid.UUID,
    activity: str,
    invite_status: InviteStatus = InviteStatus.ACCEPTED,
    starts_on: date | None = None,
    ended_on: date | None = None,
    duration_weeks: int = 4,
) -> None:
    if starts_on is None and invite_status == InviteStatus.ACCEPTED:
        starts_on = _today()
    session.add(
        Commitment(
            creator_id=creator_id,
            recipient_id=recipient_id,
            activity=activity,
            sessions_per_week=3,
            duration_weeks=duration_weeks,
            starts_on=starts_on,
            ended_on=ended_on,
            invite_status=invite_status,
        )
    )
    await session.commit()


async def _give_running_challenges(
    session: AsyncSession, user: CurrentUser, other: CurrentUser, count: int
) -> None:
    """Alternates which side `user` is on - the cap counts both."""
    for index in range(count):
        creator, recipient = (user, other) if index % 2 else (other, user)
        await _insert_challenge(
            session,
            creator_id=creator.user_id,
            recipient_id=recipient.user_id,
            activity=_FILLER_ACTIVITIES[index],
        )


async def _make_user(session: AsyncSession) -> CurrentUser:
    user = CurrentUser(user_id=uuid.uuid4(), email="third-user@example.com")
    session.add(User(id=user.user_id, email=user.email))
    await session.commit()
    return user


@pytest.fixture
async def invite(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    session: AsyncSession,
) -> Invite:
    client, me = authed_client
    await _set_username(session, me.user_id, SENDER_USERNAME)
    await _set_username(session, second_user.user_id, RECIPIENT_USERNAME)
    return Invite(client=client, sender=me, recipient=second_user, id=await _send(client))


# accept


async def test_recipient_accepts_a_live_invite(invite: Invite) -> None:
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["invite_status"] == "accepted"
    assert body["starts_on"] == _today().isoformat()
    row = await _fetch(invite.id)
    assert row is not None
    assert row.invite_status == InviteStatus.ACCEPTED
    assert row.starts_on == _today()


async def test_creator_cannot_accept_their_own_invite(invite: Invite) -> None:
    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 404
    row = await _fetch(invite.id)
    assert row is not None
    assert row.invite_status == InviteStatus.PENDING


async def test_non_participant_cannot_accept(invite: Invite, session: AsyncSession) -> None:
    _switch_user(await _make_user(session))

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 404


async def test_accepting_an_expired_invite_is_rejected(
    invite: Invite, session: AsyncSession
) -> None:
    await _expire(session, invite.id)
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 409
    assert _code(response) == INVITE_EXPIRED
    row = await _fetch(invite.id)
    assert row is not None
    assert row.invite_status == InviteStatus.PENDING


async def test_accepting_an_already_accepted_invite_is_rejected(invite: Invite) -> None:
    _switch_user(invite.recipient)
    first = await invite.client.post(f"/commitments/{invite.id}/accept")
    assert first.status_code == 200, first.text

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 409
    assert _code(response) == INVITE_NOT_PENDING
    assert "accepted" in response.json()["detail"]["message"]


async def test_recipient_at_the_cap_cannot_accept(invite: Invite, session: AsyncSession) -> None:
    await _give_running_challenges(session, invite.recipient, invite.sender, CHALLENGE_CAP)
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 409
    assert _code(response) == CHALLENGE_CAP_REACHED
    row = await _fetch(invite.id)
    assert row is not None
    assert row.invite_status == InviteStatus.PENDING
    assert row.starts_on is None


async def test_recipient_one_under_the_cap_can_accept(
    invite: Invite, session: AsyncSession
) -> None:
    await _give_running_challenges(session, invite.recipient, invite.sender, CHALLENGE_CAP - 1)
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 200, response.text


async def test_goals_do_not_count_toward_the_challenge_cap(
    invite: Invite, session: AsyncSession
) -> None:
    # One under the cap in challenges, plus a full set of goals - if goals
    # counted at all, this would be over.
    await _give_running_challenges(session, invite.recipient, invite.sender, CHALLENGE_CAP - 1)
    for activity in _FILLER_ACTIVITIES[:4]:
        session.add(
            Commitment(
                creator_id=invite.recipient.user_id,
                activity=activity,
                sessions_per_week=3,
                starts_on=_today(),
            )
        )
    await session.commit()
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 200, response.text


async def test_only_running_challenges_count_toward_the_cap(
    invite: Invite, session: AsyncSession
) -> None:
    """Quit, finished, and not-yet-answered challenges all leave room."""
    await _give_running_challenges(session, invite.recipient, invite.sender, CHALLENGE_CAP - 1)
    sides = {"creator_id": invite.sender.user_id, "recipient_id": invite.recipient.user_id}
    today = _today()
    # Quit early.
    await _insert_challenge(
        session, **sides, activity="other", starts_on=today - timedelta(days=3), ended_on=today
    )
    # Ran its full length - a 1-week challenge is finished on day 7.
    await _insert_challenge(
        session, **sides, activity="other", starts_on=today - timedelta(days=7), duration_weeks=1
    )
    # Still an unanswered invite.
    await _insert_challenge(session, **sides, activity="other", invite_status=InviteStatus.PENDING)
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 200, response.text


async def test_starts_on_uses_the_accepters_timezone_not_the_creators(
    invite: Invite, session: AsyncSession
) -> None:
    # 2026-08-09 02:00 UTC is already the 9th in Tokyo (11:00) but still the
    # 8th in Los Angeles (19:00 PDT).
    instant = datetime(2026, 8, 9, 2, 0, tzinfo=UTC)
    for user, timezone in (
        (invite.sender, "Asia/Tokyo"),
        (invite.recipient, "America/Los_Angeles"),
    ):
        row = await session.get(User, user.user_id)
        assert row is not None
        row.timezone = timezone
        session.add(row)
    await session.commit()
    await _update_commitment(session, invite.id, created_at=instant - timedelta(hours=1))
    _switch_user(invite.recipient)

    with patch.object(dates, "_now", return_value=instant):
        response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 200, response.text
    assert response.json()["starts_on"] == "2026-08-08"


# decline


async def test_recipient_declines_and_the_row_stays(invite: Invite) -> None:
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/decline")

    assert response.status_code == 200, response.text
    assert response.json()["invite_status"] == "declined"
    assert response.json()["starts_on"] is None
    row = await _fetch(invite.id)
    assert row is not None
    assert row.invite_status == InviteStatus.DECLINED


async def test_recipient_at_the_cap_can_still_decline(
    invite: Invite, session: AsyncSession
) -> None:
    await _give_running_challenges(session, invite.recipient, invite.sender, CHALLENGE_CAP)
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/decline")

    assert response.status_code == 200, response.text
    assert response.json()["invite_status"] == "declined"


async def test_an_expired_invite_can_be_declined(invite: Invite, session: AsyncSession) -> None:
    await _expire(session, invite.id)
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/decline")

    assert response.status_code == 200, response.text
    assert response.json()["invite_status"] == "declined"


async def test_creator_cannot_decline_their_own_invite(invite: Invite) -> None:
    response = await invite.client.post(f"/commitments/{invite.id}/decline")

    assert response.status_code == 404
    row = await _fetch(invite.id)
    assert row is not None
    assert row.invite_status == InviteStatus.PENDING


async def test_declining_an_already_declined_invite_is_rejected(invite: Invite) -> None:
    _switch_user(invite.recipient)
    first = await invite.client.post(f"/commitments/{invite.id}/decline")
    assert first.status_code == 200, first.text

    response = await invite.client.post(f"/commitments/{invite.id}/decline")

    assert response.status_code == 409
    assert _code(response) == INVITE_NOT_PENDING
    assert "declined" in response.json()["detail"]["message"]


# withdraw / dismiss


async def test_creator_withdraws_a_pending_invite(invite: Invite) -> None:
    response = await invite.client.delete(f"/commitments/{invite.id}")

    assert response.status_code == 204
    assert await _fetch(invite.id) is None


async def test_creator_dismisses_a_declined_invite(invite: Invite) -> None:
    _switch_user(invite.recipient)
    declined = await invite.client.post(f"/commitments/{invite.id}/decline")
    assert declined.status_code == 200, declined.text
    _switch_user(invite.sender)

    response = await invite.client.delete(f"/commitments/{invite.id}")

    assert response.status_code == 204
    assert await _fetch(invite.id) is None


async def test_creator_dismisses_an_expired_invite(invite: Invite, session: AsyncSession) -> None:
    await _expire(session, invite.id)

    response = await invite.client.delete(f"/commitments/{invite.id}")

    assert response.status_code == 204
    assert await _fetch(invite.id) is None


async def test_recipient_cannot_delete_a_pending_invite(invite: Invite) -> None:
    _switch_user(invite.recipient)

    response = await invite.client.delete(f"/commitments/{invite.id}")

    assert response.status_code == 404
    assert await _fetch(invite.id) is not None


async def test_creator_cannot_delete_an_accepted_challenge(invite: Invite) -> None:
    _switch_user(invite.recipient)
    accepted = await invite.client.post(f"/commitments/{invite.id}/accept")
    assert accepted.status_code == 200, accepted.text
    _switch_user(invite.sender)

    response = await invite.client.delete(f"/commitments/{invite.id}")

    assert response.status_code == 409
    assert _code(response) == CHALLENGE_ALREADY_ACCEPTED
    assert await _fetch(invite.id) is not None


async def test_deleting_a_challenge_leaves_completions_intact(
    invite: Invite, session: AsyncSession, make_completion: Callable[..., Any]
) -> None:
    for user in (invite.sender, invite.recipient):
        await make_completion(session, user_id=user.user_id, on_date=_today(), activity="running")

    response = await invite.client.delete(f"/commitments/{invite.id}")

    assert response.status_code == 204
    async with session_maker() as fresh:
        remaining = list(await fresh.exec(select(Completion)))
    assert len(remaining) == 2


# races


async def test_accepting_a_withdrawn_invite_says_it_is_unavailable(invite: Invite) -> None:
    withdrawn = await invite.client.delete(f"/commitments/{invite.id}")
    assert withdrawn.status_code == 204
    _switch_user(invite.recipient)

    response = await invite.client.post(f"/commitments/{invite.id}/accept")

    assert response.status_code == 404
    assert _code(response) == INVITE_UNAVAILABLE
    assert "withdrawn" in response.json()["detail"]["message"]


async def test_simultaneous_accept_and_withdraw_never_both_win(invite: Invite) -> None:
    """Really concurrent: two requests, two DB sessions, one row. Whichever
    commits first wins and the other is told what happened.
    """

    # Both identities have to be live at once, which the usual one-override-
    # at-a-time switch can't do - so each request names who it is.
    def by_header(x_test_user: str = Header()) -> CurrentUser:
        return CurrentUser(user_id=uuid.UUID(x_test_user), email="race@example.com")

    app.dependency_overrides[get_current_user] = by_header
    as_sender = {"X-Test-User": str(invite.sender.user_id)}
    as_recipient = {"X-Test-User": str(invite.recipient.user_id)}
    invite_id = invite.id

    for attempt in range(10):
        if attempt:
            invite_id = await _send(invite.client, headers=as_sender)
        accept = invite.client.post(f"/commitments/{invite_id}/accept", headers=as_recipient)
        withdraw = invite.client.delete(f"/commitments/{invite_id}", headers=as_sender)
        # Alternate who is launched first so both orderings get exercised.
        if attempt % 2:
            withdrew, accepted = await asyncio.gather(withdraw, accept)
        else:
            accepted, withdrew = await asyncio.gather(accept, withdraw)

        row = await _fetch(invite_id)
        if accepted.status_code == 200:
            assert withdrew.status_code == 409
            assert _code(withdrew) == CHALLENGE_ALREADY_ACCEPTED
            assert row is not None
            assert row.invite_status == InviteStatus.ACCEPTED
            # Clear it, or the next round's send is a duplicate.
            async with session_maker() as fresh:
                await fresh.delete(await fresh.get(Commitment, row.id))
                await fresh.commit()
        else:
            assert withdrew.status_code == 204
            assert accepted.status_code == 404
            assert _code(accepted) == INVITE_UNAVAILABLE
            assert row is None


async def test_simultaneous_accepts_cannot_exceed_the_cap(
    invite: Invite, session: AsyncSession
) -> None:
    """One slot left, two different invites accepted at the same moment -
    exactly one gets it.
    """
    await _give_running_challenges(session, invite.recipient, invite.sender, CHALLENGE_CAP - 1)
    other_invite_id = await _send(invite.client, activity="stretching_mobility")
    _switch_user(invite.recipient)

    # Left to chance the two requests rarely overlap, and the test would pass
    # with no locking at all. So each accept is held right after its count
    # until the other has counted too - the exact window in which both could
    # read "one slot left". With the lock in place the second accept can't
    # reach its count while the first is held, so the first gives up waiting,
    # commits, and the second then counts a full house.
    real_count = commitments_router._count_running_challenges
    counted = 0
    both_counted = asyncio.Event()

    async def count_then_wait_for_the_other(*args: Any) -> int:
        nonlocal counted
        result = await real_count(*args)
        counted += 1
        if counted == 2:
            both_counted.set()
        try:
            await asyncio.wait_for(both_counted.wait(), timeout=0.5)
        except TimeoutError:
            pass
        return result

    with patch.object(
        commitments_router, "_count_running_challenges", count_then_wait_for_the_other
    ):
        responses = await asyncio.gather(
            invite.client.post(f"/commitments/{invite.id}/accept"),
            invite.client.post(f"/commitments/{other_invite_id}/accept"),
        )

    assert sorted(r.status_code for r in responses) == [200, 409]
    rejected = next(r for r in responses if r.status_code == 409)
    assert _code(rejected) == CHALLENGE_CAP_REACHED
    async with session_maker() as fresh:
        accepted = list(
            await fresh.exec(
                select(Commitment).where(Commitment.invite_status == InviteStatus.ACCEPTED)
            )
        )
    assert len(accepted) == CHALLENGE_CAP
