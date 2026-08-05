from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import func, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.plan import Plan


def _switch_user(user: CurrentUser) -> None:
    """Reassign the shared get_current_user override to act as a different user
    (see second_user fixture in conftest.py for why this is a reassignment, not a
    second client).
    """
    app.dependency_overrides[get_current_user] = lambda: user


def _today() -> str:
    return datetime.now(UTC).date().isoformat()


def _days_from_today(days: int) -> str:
    return (datetime.now(UTC).date() + timedelta(days=days)).isoformat()


def _plan_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Push Pull Legs",
        "starts_on": _today(),
        "ends_on": None,
        "visible_to_friends": False,
    }
    payload.update(overrides)
    return payload


async def _count_active(session: AsyncSession, user_id: UUID) -> int:
    result = await session.exec(
        select(func.count()).select_from(Plan).where(Plan.user_id == user_id, Plan.is_active)
    )
    return result.one()


@pytest.mark.asyncio
async def test_create_plan_returns_201_matching_input(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, user = authed_client
    payload = _plan_payload(
        name="My Split", starts_on=_days_from_today(1), ends_on=_days_from_today(180)
    )

    response = await client.post("/plans", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == payload["name"]
    assert body["starts_on"] == payload["starts_on"]
    assert body["ends_on"] == payload["ends_on"]
    assert body["visible_to_friends"] == payload["visible_to_friends"]
    assert body["is_active"] is True
    assert body["user_id"] == str(user.user_id)


@pytest.mark.asyncio
async def test_create_plan_with_ends_on_before_starts_on_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    payload = _plan_payload(starts_on=_days_from_today(30), ends_on=_days_from_today(1))

    response = await client.post("/plans", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_plan_with_unknown_field_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    payload = _plan_payload(sneaky_field="not a real field")

    response = await client.post("/plans", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_plan_with_unknown_field_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post("/plans", json=_plan_payload())
    plan_id = created.json()["id"]

    patched = await client.patch(f"/plans/{plan_id}", json={"sneaky_field": "nope"})

    assert patched.status_code == 422


@pytest.mark.asyncio
async def test_create_plan_with_starts_on_in_past_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    payload = _plan_payload(starts_on=_days_from_today(-1))

    response = await client.post("/plans", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_plan_with_starts_on_today_is_201(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    payload = _plan_payload(starts_on=_today())

    response = await client.post("/plans", json=payload)

    assert response.status_code == 201
    assert response.json()["starts_on"] == _today()


@pytest.mark.asyncio
async def test_patch_starts_on_to_past_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post("/plans", json=_plan_payload())
    plan_id = created.json()["id"]

    patched = await client.patch(f"/plans/{plan_id}", json={"starts_on": _days_from_today(-1)})

    assert patched.status_code == 422


@pytest.mark.asyncio
async def test_patch_starts_on_after_existing_ends_on_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    """PATCHing only starts_on (leaving ends_on untouched) must validate against the
    plan's *existing* ends_on - PlanUpdate's own validator only fires when both dates
    are in the same request body, so this is the router-level check in update_plan.
    """
    client, _me = authed_client
    created = await client.post(
        "/plans",
        json=_plan_payload(starts_on=_days_from_today(1), ends_on=_days_from_today(10)),
    )
    plan_id = created.json()["id"]

    patched = await client.patch(f"/plans/{plan_id}", json={"starts_on": _days_from_today(20)})

    assert patched.status_code == 422


@pytest.mark.asyncio
async def test_list_plans_returns_only_my_plans(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client

    mine = await client.post("/plans", json=_plan_payload(name="Mine"))
    assert mine.status_code == 201
    my_plan_id = mine.json()["id"]

    _switch_user(second_user)
    theirs = await client.post("/plans", json=_plan_payload(name="Theirs"))
    assert theirs.status_code == 201
    their_plan_id = theirs.json()["id"]

    _switch_user(me)
    listing = await client.get("/plans")
    assert listing.status_code == 200
    ids = {plan["id"] for plan in listing.json()}
    assert my_plan_id in ids
    assert their_plan_id not in ids


@pytest.mark.asyncio
async def test_get_plan_ownership_and_missing(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client

    created = await client.post("/plans", json=_plan_payload())
    plan_id = created.json()["id"]

    own = await client.get(f"/plans/{plan_id}")
    assert own.status_code == 200

    _switch_user(second_user)
    other = await client.get(f"/plans/{plan_id}")
    assert other.status_code == 404

    _switch_user(me)
    missing = await client.get(f"/plans/{uuid4()}")
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_patch_plan_updates_name_and_persists(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    created = await client.post("/plans", json=_plan_payload(name="Original"))
    plan_id = created.json()["id"]

    patched = await client.patch(f"/plans/{plan_id}", json={"name": "Renamed"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Renamed"

    refetched = await client.get(f"/plans/{plan_id}")
    assert refetched.json()["name"] == "Renamed"


@pytest.mark.asyncio
async def test_patch_other_users_plan_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client
    created = await client.post("/plans", json=_plan_payload(name="Original"))
    plan_id = created.json()["id"]

    _switch_user(second_user)
    patched = await client.patch(f"/plans/{plan_id}", json={"name": "Hijacked"})
    assert patched.status_code == 404

    _switch_user(me)
    unchanged = await client.get(f"/plans/{plan_id}")
    assert unchanged.json()["name"] == "Original"


@pytest.mark.asyncio
async def test_delete_plan_then_get_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _me = authed_client
    created = await client.post("/plans", json=_plan_payload())
    plan_id = created.json()["id"]

    deleted = await client.delete(f"/plans/{plan_id}")
    assert deleted.status_code == 204

    gone = await client.get(f"/plans/{plan_id}")
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_delete_other_users_plan_is_404_and_plan_survives(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser
) -> None:
    client, me = authed_client
    created = await client.post("/plans", json=_plan_payload())
    plan_id = created.json()["id"]

    _switch_user(second_user)
    deleted = await client.delete(f"/plans/{plan_id}")
    assert deleted.status_code == 404

    _switch_user(me)
    still_there = await client.get(f"/plans/{plan_id}")
    assert still_there.status_code == 200


@pytest.mark.asyncio
async def test_only_one_active_plan_per_user(
    authed_client: tuple[AsyncClient, CurrentUser], session: AsyncSession
) -> None:
    client, me = authed_client

    plan_a = await client.post("/plans", json=_plan_payload(name="A"))
    assert plan_a.status_code == 201
    plan_a_id = plan_a.json()["id"]
    assert plan_a.json()["is_active"] is True
    assert await _count_active(session, me.user_id) == 1

    plan_b = await client.post("/plans", json=_plan_payload(name="B"))
    assert plan_b.status_code == 201
    plan_b_id = plan_b.json()["id"]
    assert plan_b.json()["is_active"] is True

    a_after_b = await client.get(f"/plans/{plan_a_id}")
    assert a_after_b.json()["is_active"] is False
    assert await _count_active(session, me.user_id) == 1

    reactivate_a = await client.patch(f"/plans/{plan_a_id}", json={"is_active": True})
    assert reactivate_a.status_code == 200
    assert reactivate_a.json()["is_active"] is True

    b_after_reactivate = await client.get(f"/plans/{plan_b_id}")
    assert b_after_reactivate.json()["is_active"] is False
    assert await _count_active(session, me.user_id) == 1


@pytest.mark.asyncio
async def test_unauthenticated_requests_are_401(client: AsyncClient) -> None:
    random_id = uuid4()

    assert (await client.post("/plans", json=_plan_payload())).status_code == 401
    assert (await client.get("/plans")).status_code == 401
    assert (await client.get(f"/plans/{random_id}")).status_code == 401
    assert (await client.patch(f"/plans/{random_id}", json={"name": "x"})).status_code == 401
    assert (await client.delete(f"/plans/{random_id}")).status_code == 401
