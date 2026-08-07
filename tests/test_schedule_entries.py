import uuid
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.schedule_entry import ScheduleEntry


def _switch_user(user: CurrentUser) -> None:
    """Reassign the shared get_current_user override to act as a different user
    (see second_user fixture in conftest.py for why this is a reassignment, not a
    second client).
    """
    app.dependency_overrides[get_current_user] = lambda: user


def _days_after(start_iso: str, days: int) -> str:
    return (date.fromisoformat(start_iso) + timedelta(days=days)).isoformat()


# A. entry CRUD happy paths


@pytest.mark.asyncio
async def test_entry_crud_happy_path(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    created = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["workout_id"] == workout["id"]
    assert body["day_of_week"] == 1
    assert body["plan_id"] == plan["id"]
    entry_id = body["id"]

    listing = await client.get(f"/plans/{plan['id']}/schedule-entries")
    assert listing.status_code == 200
    assert any(entry["id"] == entry_id for entry in listing.json())

    patched = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry_id}", json={"day_of_week": 3}
    )
    assert patched.status_code == 200
    assert patched.json()["day_of_week"] == 3

    deleted = await client.delete(f"/plans/{plan['id']}/schedule-entries/{entry_id}")
    assert deleted.status_code == 204

    after = await client.get(f"/plans/{plan['id']}/schedule-entries")
    assert all(entry["id"] != entry_id for entry in after.json())


# B. workout from a different plan


@pytest.mark.asyncio
async def test_create_with_workout_from_different_plan_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan_a = await make_plan(client, name="Plan A")
    plan_b = await make_plan(client, name="Plan B")
    workout_in_b = await make_workout(client, plan_b["id"])

    response = await client.post(
        f"/plans/{plan_a['id']}/schedule-entries",
        json={"workout_id": workout_in_b["id"], "day_of_week": 1},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_workout_id_to_different_plan_workout_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan_a = await make_plan(client, name="Plan A")
    plan_b = await make_plan(client, name="Plan B")
    workout_a = await make_workout(client, plan_a["id"])
    workout_b = await make_workout(client, plan_b["id"])

    created = await client.post(
        f"/plans/{plan_a['id']}/schedule-entries",
        json={"workout_id": workout_a["id"], "day_of_week": 1},
    )
    entry_id = created.json()["id"]

    response = await client.patch(
        f"/plans/{plan_a['id']}/schedule-entries/{entry_id}",
        json={"workout_id": workout_b["id"]},
    )

    assert response.status_code == 404


# C. validation


@pytest.mark.asyncio
async def test_day_of_week_out_of_range_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    for bad_day in (0, 8):
        response = await client.post(
            f"/plans/{plan['id']}/schedule-entries",
            json={"workout_id": workout["id"], "day_of_week": bad_day},
        )
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_stage_b_fields_in_body_are_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    on_date_attempt = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1, "on_date": "2026-08-10"},
    )
    assert on_date_attempt.status_code == 422

    name_override_attempt = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1, "name_override": "Sneaky"},
    )
    assert name_override_attempt.status_code == 422


@pytest.mark.asyncio
async def test_create_with_ends_on_before_starts_on_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={
            "workout_id": workout["id"],
            "day_of_week": 1,
            "starts_on": "2026-08-20",
            "ends_on": "2026-08-01",
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_starts_on_after_existing_ends_on_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    created = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={
            "workout_id": workout["id"],
            "day_of_week": 1,
            "starts_on": "2026-08-01",
            "ends_on": "2026-08-10",
        },
    )
    entry_id = created.json()["id"]

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry_id}", json={"starts_on": "2026-08-20"}
    )

    assert response.status_code == 422


# D. ownership matrix


@pytest.mark.asyncio
async def test_user_b_via_a_plan_id_is_404_on_every_route(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
    make_workout: Any,
) -> None:
    client, _me = authed_client
    plan_a = await make_plan(client)
    workout_a = await make_workout(client, plan_a["id"])
    created = await client.post(
        f"/plans/{plan_a['id']}/schedule-entries",
        json={"workout_id": workout_a["id"], "day_of_week": 1},
    )
    entry_id = created.json()["id"]

    _switch_user(second_user)

    create = await client.post(
        f"/plans/{plan_a['id']}/schedule-entries",
        json={"workout_id": workout_a["id"], "day_of_week": 2},
    )
    assert create.status_code == 404

    listing = await client.get(f"/plans/{plan_a['id']}/schedule-entries")
    assert listing.status_code == 404

    patched = await client.patch(
        f"/plans/{plan_a['id']}/schedule-entries/{entry_id}", json={"day_of_week": 3}
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"/plans/{plan_a['id']}/schedule-entries/{entry_id}")
    assert deleted.status_code == 404


@pytest.mark.asyncio
async def test_chain_entry_id_must_belong_to_url_plan_id(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
    make_workout: Any,
) -> None:
    """B's own plan_id is validly owned, but A's entry doesn't belong to it - the
    mismatched chain must 404 anyway, not fall back to "any plan I own".
    """
    client, me = authed_client
    plan_a = await make_plan(client, name="Plan A")
    workout_a = await make_workout(client, plan_a["id"])
    created = await client.post(
        f"/plans/{plan_a['id']}/schedule-entries",
        json={"workout_id": workout_a["id"], "day_of_week": 1},
    )
    entry_id = created.json()["id"]

    _switch_user(second_user)
    plan_b = await make_plan(client, name="Plan B")

    patched = await client.patch(
        f"/plans/{plan_b['id']}/schedule-entries/{entry_id}", json={"day_of_week": 5}
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"/plans/{plan_b['id']}/schedule-entries/{entry_id}")
    assert deleted.status_code == 404

    _switch_user(me)
    unchanged = await client.get(f"/plans/{plan_a['id']}/schedule-entries")
    entry = next(e for e in unchanged.json() if e["id"] == entry_id)
    assert entry["day_of_week"] == 1


@pytest.mark.asyncio
async def test_nonexistent_entry_id_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    patched = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{uuid4()}", json={"day_of_week": 2}
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"/plans/{plan['id']}/schedule-entries/{uuid4()}")
    assert deleted.status_code == 404


# E. cascade


@pytest.mark.asyncio
async def test_deleting_plan_cascades_to_entries(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    session: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    created = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1},
    )
    assert created.status_code == 201

    deleted = await client.delete(f"/plans/{plan['id']}")
    assert deleted.status_code == 204

    result = await session.exec(
        select(ScheduleEntry).where(ScheduleEntry.plan_id == uuid.UUID(plan["id"]))
    )
    assert list(result) == []


@pytest.mark.asyncio
async def test_deleting_workout_cascades_to_its_entries(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    session: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    created = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1},
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]

    deleted = await client.delete(f"/plans/{plan['id']}/workouts/{workout['id']}")
    assert deleted.status_code == 204

    result = await session.exec(
        select(ScheduleEntry).where(ScheduleEntry.id == uuid.UUID(entry_id))
    )
    assert list(result) == []


# F. schedule window validation


@pytest.mark.asyncio
async def test_schedule_from_after_to_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-10", "to": "2026-08-09"}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_schedule_window_over_92_days_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.get(
        f"/plans/{plan['id']}/schedule",
        params={"from": "2026-01-01", "to": _days_after("2026-01-01", 92)},  # 93-day span
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_schedule_window_of_92_days_is_200(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.get(
        f"/plans/{plan['id']}/schedule",
        params={"from": "2026-01-01", "to": _days_after("2026-01-01", 91)},  # 92-day span
    )

    assert response.status_code == 200


# G. schedule endpoint shape


@pytest.mark.asyncio
async def test_schedule_shape_mwf_one_week_window(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    mon_workout = await make_workout(client, plan["id"], name="Push", notes="chest/shoulders")
    wed_workout = await make_workout(client, plan["id"], name="Pull", notes="back/biceps")
    fri_workout = await make_workout(client, plan["id"], name="Legs")

    for workout, day in ((mon_workout, 1), (wed_workout, 3), (fri_workout, 5)):
        created = await client.post(
            f"/plans/{plan['id']}/schedule-entries",
            json={"workout_id": workout["id"], "day_of_week": day},
        )
        assert created.status_code == 201

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-10", "to": "2026-08-16"}
    )

    assert response.status_code == 200
    days = response.json()["days"]

    expected_dates = {f"2026-08-{day:02d}" for day in range(10, 17)}
    assert set(days.keys()) == expected_dates

    assert len(days["2026-08-10"]) == 1  # Mon
    assert days["2026-08-10"][0]["name"] == "Push"
    assert days["2026-08-10"][0]["notes"] == "chest/shoulders"

    assert days["2026-08-11"] == []  # Tue

    assert len(days["2026-08-12"]) == 1  # Wed
    assert days["2026-08-12"][0]["name"] == "Pull"
    assert days["2026-08-12"][0]["notes"] == "back/biceps"

    assert days["2026-08-13"] == []  # Thu

    assert len(days["2026-08-14"]) == 1  # Fri
    assert days["2026-08-14"][0]["name"] == "Legs"
    assert days["2026-08-14"][0]["notes"] is None

    assert days["2026-08-15"] == []  # Sat
    assert days["2026-08-16"] == []  # Sun


# H. inactive plan


@pytest.mark.asyncio
async def test_schedule_works_on_inactive_plan(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan_a = await make_plan(client, name="Plan A")
    workout = await make_workout(client, plan_a["id"])
    created = await client.post(
        f"/plans/{plan_a['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1},
    )
    assert created.status_code == 201

    await make_plan(client, name="Plan B")  # one-active-plan rule deactivates plan A

    check_a = await client.get(f"/plans/{plan_a['id']}")
    assert check_a.json()["is_active"] is False

    response = await client.get(
        f"/plans/{plan_a['id']}/schedule", params={"from": "2026-08-10", "to": "2026-08-10"}
    )

    assert response.status_code == 200
    assert len(response.json()["days"]["2026-08-10"]) == 1


# I. ownership + auth on the schedule endpoint


@pytest.mark.asyncio
async def test_schedule_on_unowned_plan_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser, make_plan: Any
) -> None:
    client, _me = authed_client
    plan = await make_plan(client)

    _switch_user(second_user)
    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-10", "to": "2026-08-10"}
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_requests_are_401(client: AsyncClient) -> None:
    fake_plan_id = uuid4()
    fake_entry_id = uuid4()

    create = await client.post(
        f"/plans/{fake_plan_id}/schedule-entries",
        json={"workout_id": str(uuid4()), "day_of_week": 1},
    )
    assert create.status_code == 401

    assert (await client.get(f"/plans/{fake_plan_id}/schedule-entries")).status_code == 401

    patched = await client.patch(
        f"/plans/{fake_plan_id}/schedule-entries/{fake_entry_id}", json={"day_of_week": 2}
    )
    assert patched.status_code == 401

    deleted = await client.delete(f"/plans/{fake_plan_id}/schedule-entries/{fake_entry_id}")
    assert deleted.status_code == 401

    schedule = await client.get(
        f"/plans/{fake_plan_id}/schedule", params={"from": "2026-08-10", "to": "2026-08-10"}
    )
    assert schedule.status_code == 401
