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
        json={"workout_id": workout["id"], "day_of_week": 1, "on_date": "2026-08-24"},
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
            "starts_on": "2026-09-03",
            "ends_on": "2026-08-15",
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
            "starts_on": "2026-08-15",
            "ends_on": "2026-08-24",
        },
    )
    entry_id = created.json()["id"]

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry_id}", json={"starts_on": "2026-09-03"}
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
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-23"}
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
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-30"}
    )

    assert response.status_code == 200
    days = response.json()["days"]

    expected_dates = {f"2026-08-{day:02d}" for day in range(24, 31)}
    assert set(days.keys()) == expected_dates

    assert days["2026-08-24"]["status"] == "scheduled"  # Mon
    assert len(days["2026-08-24"]["entries"]) == 1
    assert days["2026-08-24"]["entries"][0]["name"] == "Push"
    assert days["2026-08-24"]["entries"][0]["notes"] == "chest/shoulders"
    assert days["2026-08-24"]["entries"][0]["status"] == "scheduled"

    assert days["2026-08-25"]["status"] == "empty"  # Tue
    assert days["2026-08-25"]["entries"] == []

    assert len(days["2026-08-26"]["entries"]) == 1  # Wed
    assert days["2026-08-26"]["entries"][0]["name"] == "Pull"
    assert days["2026-08-26"]["entries"][0]["notes"] == "back/biceps"

    assert days["2026-08-27"]["entries"] == []  # Thu

    assert len(days["2026-08-28"]["entries"]) == 1  # Fri
    assert days["2026-08-28"]["entries"][0]["name"] == "Legs"
    assert days["2026-08-28"]["entries"][0]["notes"] is None

    assert days["2026-08-29"]["entries"] == []  # Sat
    assert days["2026-08-30"]["entries"] == []  # Sun


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
        f"/plans/{plan_a['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )

    assert response.status_code == 200
    assert len(response.json()["days"]["2026-08-24"]["entries"]) == 1


# I. ownership + auth on the schedule endpoint


@pytest.mark.asyncio
async def test_schedule_on_unowned_plan_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], second_user: CurrentUser, make_plan: Any
) -> None:
    client, _me = authed_client
    plan = await make_plan(client)

    _switch_user(second_user)
    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
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
        f"/plans/{fake_plan_id}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    assert schedule.status_code == 401


# K. dated entries


@pytest.mark.asyncio
async def test_create_dated_entry(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "on_date": "2026-08-24"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["on_date"] == "2026-08-24"
    assert body["day_of_week"] is None


# L. kind XOR at creation


@pytest.mark.asyncio
async def test_create_with_both_day_of_week_and_on_date_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1, "on_date": "2026-08-24"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_with_neither_day_of_week_nor_on_date_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries", json={"workout_id": workout["id"]}
    )

    assert response.status_code == 422


# M. date bounds are forbidden on dated entries


@pytest.mark.asyncio
async def test_create_dated_entry_with_starts_on_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "on_date": "2026-08-24", "starts_on": "2026-08-15"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_dated_entry_with_ends_on_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "on_date": "2026-08-24", "ends_on": "2026-09-03"},
    )

    assert response.status_code == 422


# N. replaces_entry_id is forbidden on recurring entries


@pytest.mark.asyncio
async def test_create_with_replaces_entry_id_and_day_of_week_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    target = await make_entry(client, plan["id"], workout_id=workout["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 2, "replaces_entry_id": target["id"]},
    )

    assert response.status_code == 422


# O. name-only entries


@pytest.mark.asyncio
async def test_create_name_only_entry(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"day_of_week": 1, "name_override": "Recovery walk"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["workout_id"] is None
    assert body["name_override"] == "Recovery walk"


@pytest.mark.asyncio
async def test_create_with_name_override_and_workout_id_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "day_of_week": 1, "name_override": "Sneaky"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_with_none_of_workout_name_or_replaces_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(f"/plans/{plan['id']}/schedule-entries", json={"day_of_week": 1})

    assert response.status_code == 422


# P. replaces_entry_id scoping


@pytest.mark.asyncio
async def test_create_with_nonexistent_replaces_entry_id_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={
            "workout_id": workout["id"],
            "on_date": "2026-08-24",
            "replaces_entry_id": str(uuid4()),
        },
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_with_replaces_entry_id_from_different_plan_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan_a = await make_plan(client, name="Plan A")
    plan_b = await make_plan(client, name="Plan B")
    workout_a = await make_workout(client, plan_a["id"])
    workout_b = await make_workout(client, plan_b["id"])
    entry_in_a = await make_entry(client, plan_a["id"], workout_id=workout_a["id"])

    response = await client.post(
        f"/plans/{plan_b['id']}/schedule-entries",
        json={
            "workout_id": workout_b["id"],
            "on_date": "2026-08-24",
            "replaces_entry_id": entry_in_a["id"],
        },
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_replaces_entry_id_to_self_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    target = await make_entry(client, plan["id"], workout_id=workout["id"])
    dated = await make_entry(
        client,
        plan["id"],
        workout_id=workout["id"],
        on_date="2026-08-24",
        replaces_entry_id=target["id"],
    )

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{dated['id']}",
        json={"replaces_entry_id": dated["id"]},
    )

    assert response.status_code == 422


# Q. the cancellation test


@pytest.mark.asyncio
async def test_cancellation_empties_one_monday_others_unaffected(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"], name="Push")
    recurring = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    await make_entry(
        client,
        plan["id"],
        on_date="2026-08-24",
        replaces_entry_id=recurring["id"],  # Monday
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-17", "to": "2026-08-31"}
    )
    assert response.status_code == 200
    days = response.json()["days"]

    assert days["2026-08-17"]["status"] == "scheduled"  # Monday before, unaffected
    assert days["2026-08-17"]["entries"] != []

    # the cancelled Monday: entries is empty, same as a day with nothing
    # scheduled - but status distinguishes the two, which is the entire
    # regression this task exists to close.
    assert days["2026-08-24"]["entries"] == []
    assert days["2026-08-24"]["status"] == "cancelled"
    assert days["2026-08-24"]["cancelled"] == [{"entry_id": recurring["id"], "name": "Push"}]

    # a day with genuinely nothing scheduled (no entry, no cancellation) must
    # report a *different* status than the cancelled Monday above
    assert days["2026-08-18"]["entries"] == []
    assert days["2026-08-18"]["status"] == "empty"
    assert days["2026-08-18"]["cancelled"] == []
    assert days["2026-08-18"]["status"] != days["2026-08-24"]["status"]

    assert days["2026-08-31"]["status"] == "scheduled"  # Monday after, unaffected
    assert days["2026-08-31"]["entries"] != []


# R. the substitution test


@pytest.mark.asyncio
async def test_substitution_replaces_one_monday_others_show_original(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    original = await make_workout(client, plan["id"], name="Push")
    substitute = await make_workout(client, plan["id"], name="Yoga")
    recurring = await make_entry(client, plan["id"], workout_id=original["id"], day_of_week=1)

    await make_entry(
        client,
        plan["id"],
        workout_id=substitute["id"],
        on_date="2026-08-24",  # Monday
        replaces_entry_id=recurring["id"],
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-17", "to": "2026-08-31"}
    )
    assert response.status_code == 200
    days = response.json()["days"]

    # ordinary day: not reported as substituted just because a substitution
    # exists elsewhere in the plan
    assert days["2026-08-17"]["status"] == "scheduled"
    assert len(days["2026-08-17"]["entries"]) == 1
    assert days["2026-08-17"]["entries"][0]["name"] == "Push"
    assert days["2026-08-17"]["entries"][0]["status"] == "scheduled"
    assert days["2026-08-17"]["entries"][0]["replaced"] is None

    assert days["2026-08-24"]["status"] == "substituted"
    assert len(days["2026-08-24"]["entries"]) == 1
    substituted_entry = days["2026-08-24"]["entries"][0]
    assert substituted_entry["name"] == "Yoga"
    assert substituted_entry["status"] == "substituted"
    assert substituted_entry["replaced"] == {"entry_id": recurring["id"], "name": "Push"}

    assert days["2026-08-31"]["status"] == "scheduled"
    assert len(days["2026-08-31"]["entries"]) == 1
    assert days["2026-08-31"]["entries"][0]["name"] == "Push"
    assert days["2026-08-31"]["entries"][0]["status"] == "scheduled"


# S. PATCH kind-lock


@pytest.mark.asyncio
async def test_patch_day_of_week_on_dated_entry_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    dated = await make_entry(client, plan["id"], workout_id=workout["id"], on_date="2026-08-24")

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{dated['id']}", json={"day_of_week": 1}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_on_date_on_recurring_entry_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    recurring = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{recurring['id']}",
        json={"on_date": "2026-08-24"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_on_date_on_dated_entry_moves_the_schedule(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    dated = await make_entry(client, plan["id"], workout_id=workout["id"], on_date="2026-08-24")

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{dated['id']}", json={"on_date": "2026-08-25"}
    )
    assert response.status_code == 200
    assert response.json()["on_date"] == "2026-08-25"

    schedule = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-25"}
    )
    days = schedule.json()["days"]
    assert days["2026-08-24"]["entries"] == []
    assert len(days["2026-08-25"]["entries"]) == 1


# T. PATCH clearing


@pytest.mark.asyncio
async def test_patch_clearing_name_override_with_nothing_left_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    created = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"day_of_week": 1, "name_override": "Recovery walk"},
    )
    entry_id = created.json()["id"]

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry_id}", json={"name_override": None}
    )

    assert response.status_code == 422


# U. cascade onto replacements and cancellations


@pytest.mark.asyncio
async def test_deleting_target_cascades_to_replacement_and_cancellation(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
    session: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    target = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    replacement = await make_entry(
        client,
        plan["id"],
        workout_id=workout["id"],
        on_date="2026-08-24",
        replaces_entry_id=target["id"],
    )
    cancellation = await make_entry(
        client, plan["id"], on_date="2026-08-31", replaces_entry_id=target["id"]
    )

    deleted = await client.delete(f"/plans/{plan['id']}/schedule-entries/{target['id']}")
    assert deleted.status_code == 204

    result = await session.exec(
        select(ScheduleEntry).where(
            ScheduleEntry.id.in_([uuid.UUID(replacement["id"]), uuid.UUID(cancellation["id"])])
        )
    )
    assert list(result) == []


# V. schedule shape for name-only entries


@pytest.mark.asyncio
async def test_schedule_shape_name_only_entry(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"day_of_week": 1, "name_override": "Recovery walk"},
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    assert response.status_code == 200
    day = response.json()["days"]["2026-08-24"]
    assert set(day.keys()) == {"status", "entries", "cancelled"}
    assert day["status"] == "scheduled"

    entries = day["entries"]
    assert len(entries) == 1
    entry = entries[0]
    assert set(entry.keys()) == {
        "entry_id",
        "workout_id",
        "name",
        "notes",
        "status",
        "replaced",
    }
    assert entry["workout_id"] is None
    assert entry["name"] == "Recovery walk"
    assert entry["status"] == "scheduled"
    assert entry["replaced"] is None
    assert entry["notes"] is None


# W. ownership on Stage B fields


@pytest.mark.asyncio
async def test_user_b_cannot_reference_user_a_entry_via_replaces_entry_id(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _me = authed_client
    plan_a = await make_plan(client)
    workout_a = await make_workout(client, plan_a["id"])
    entry_a = await make_entry(client, plan_a["id"], workout_id=workout_a["id"])

    _switch_user(second_user)
    plan_b = await make_plan(client)
    workout_b = await make_workout(client, plan_b["id"])

    response = await client.post(
        f"/plans/{plan_b['id']}/schedule-entries",
        json={
            "workout_id": workout_b["id"],
            "on_date": "2026-08-24",
            "replaces_entry_id": entry_a["id"],
        },
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_user_b_patch_delete_on_user_a_dated_entry_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _me = authed_client
    plan_a = await make_plan(client)
    workout_a = await make_workout(client, plan_a["id"])
    dated_a = await make_entry(
        client, plan_a["id"], workout_id=workout_a["id"], on_date="2026-08-24"
    )

    _switch_user(second_user)

    patched = await client.patch(
        f"/plans/{plan_a['id']}/schedule-entries/{dated_a['id']}",
        json={"on_date": "2026-08-25"},
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"/plans/{plan_a['id']}/schedule-entries/{dated_a['id']}")
    assert deleted.status_code == 404


# X. unauthenticated on Stage B route/param combinations


@pytest.mark.asyncio
async def test_unauthenticated_stage_b_requests_are_401(client: AsyncClient) -> None:
    fake_plan_id = uuid4()
    fake_entry_id = uuid4()

    dated_create = await client.post(
        f"/plans/{fake_plan_id}/schedule-entries",
        json={"workout_id": str(uuid4()), "on_date": "2026-08-24"},
    )
    assert dated_create.status_code == 401

    name_only_create = await client.post(
        f"/plans/{fake_plan_id}/schedule-entries",
        json={"day_of_week": 1, "name_override": "Recovery walk"},
    )
    assert name_only_create.status_code == 401

    replacement_create = await client.post(
        f"/plans/{fake_plan_id}/schedule-entries",
        json={
            "workout_id": str(uuid4()),
            "on_date": "2026-08-24",
            "replaces_entry_id": str(uuid4()),
        },
    )
    assert replacement_create.status_code == 401

    patched = await client.patch(
        f"/plans/{fake_plan_id}/schedule-entries/{fake_entry_id}",
        json={"on_date": "2026-08-25"},
    )
    assert patched.status_code == 401


# S (continued). remaining PATCH kind-lock branches


@pytest.mark.asyncio
async def test_patch_starts_on_on_dated_entry_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    dated = await make_entry(client, plan["id"], workout_id=workout["id"], on_date="2026-08-24")

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{dated['id']}",
        json={"starts_on": "2026-08-15"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_replaces_entry_id_on_recurring_entry_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    recurring = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    dated_target = await make_entry(
        client, plan["id"], workout_id=workout["id"], on_date="2026-08-24"
    )

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{recurring['id']}",
        json={"replaces_entry_id": dated_target["id"]},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_replaces_entry_id_to_nonexistent_entry_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    dated = await make_entry(client, plan["id"], workout_id=workout["id"], on_date="2026-08-24")

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{dated['id']}",
        json={"replaces_entry_id": str(uuid4())},
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_patch_merged_workout_id_and_name_override_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """workout_id is already set from creation; PATCHing name_override alone
    (not touching workout_id in this payload) still must 422 against the
    *merged* row, not just payloads that set both fields at once.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry['id']}",
        json={"name_override": "Sneaky"},
    )

    assert response.status_code == 422


# schema-level same-payload conflicts on PATCH (distinct from the router's
# kind-lock, which compares a single field against the *existing* row)


@pytest.mark.asyncio
async def test_patch_body_with_day_of_week_and_on_date_together_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    recurring = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{recurring['id']}",
        json={"day_of_week": 2, "on_date": "2026-08-24"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_body_with_on_date_and_starts_on_together_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    dated = await make_entry(client, plan["id"], workout_id=workout["id"], on_date="2026-08-24")

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{dated['id']}",
        json={"on_date": "2026-08-25", "starts_on": "2026-08-15"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_body_with_replaces_entry_id_and_day_of_week_together_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    recurring = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{recurring['id']}",
        json={"day_of_week": 2, "replaces_entry_id": str(uuid4())},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_body_with_name_override_and_workout_id_together_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout_a = await make_workout(client, plan["id"], name="A")
    workout_b = await make_workout(client, plan["id"], name="B")
    entry = await make_entry(client, plan["id"], workout_id=workout_a["id"], day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry['id']}",
        json={"workout_id": workout_b["id"], "name_override": "Sneaky"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_pairing_workout_id_with_explicit_null_name_override_succeeds(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """The trap the invariants call out: switching an entry from a typed name
    to an existing workout requires sending workout_id and name_override:
    null together. Unlike the previous test, name_override here is null, not
    another real value, so this is not a conflict - both fields being
    *present* in the payload isn't itself the problem.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], name_override="Sneaky", day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry['id']}",
        json={"workout_id": workout["id"], "name_override": None},
    )

    assert response.status_code == 200
    assert response.json()["workout_id"] == workout["id"]
    assert response.json()["name_override"] is None


@pytest.mark.asyncio
async def test_patch_pairing_name_override_with_explicit_null_workout_id_succeeds(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """The mirror image: switching from a real workout to a typed name."""
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry['id']}",
        json={"name_override": "Grandma stretches", "workout_id": None},
    )

    assert response.status_code == 200
    assert response.json()["name_override"] == "Grandma stretches"
    assert response.json()["workout_id"] is None


# Y. Commit B: mixed day and name-only entries in each applicable state


@pytest.mark.asyncio
async def test_mixed_day_scheduled_and_cancelled_reports_scheduled(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """Endpoint-level check of the approved mixed-day rule: a real,
    unmodified entry outranks an unrelated cancellation on the same day. The
    cancelled entry is still fully reported via `cancelled` - only the
    day-level headline status is affected.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    unrelated_workout = await make_workout(client, plan["id"], name="Push")
    cancelled_workout = await make_workout(client, plan["id"], name="Pull")
    await make_entry(client, plan["id"], workout_id=unrelated_workout["id"], day_of_week=1)
    cancelled_target = await make_entry(
        client, plan["id"], workout_id=cancelled_workout["id"], day_of_week=1
    )
    await make_entry(
        client, plan["id"], on_date="2026-08-24", replaces_entry_id=cancelled_target["id"]
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    assert response.status_code == 200
    day = response.json()["days"]["2026-08-24"]

    assert day["status"] == "scheduled"
    assert [e["name"] for e in day["entries"]] == ["Push"]
    assert day["cancelled"] == [{"entry_id": cancelled_target["id"], "name": "Pull"}]


@pytest.mark.asyncio
async def test_name_only_entry_as_cancellation_target_names_correctly(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_entry: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    rest_day = await make_entry(client, plan["id"], name_override="Rest", day_of_week=1)
    await make_entry(client, plan["id"], on_date="2026-08-24", replaces_entry_id=rest_day["id"])

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    assert response.status_code == 200
    day = response.json()["days"]["2026-08-24"]

    assert day["status"] == "cancelled"
    assert day["entries"] == []
    assert day["cancelled"] == [{"entry_id": rest_day["id"], "name": "Rest"}]


@pytest.mark.asyncio
async def test_name_only_entry_as_replacement_reports_its_own_name(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"], name="Push")
    recurring = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    await make_entry(
        client,
        plan["id"],
        name_override="Active recovery",
        on_date="2026-08-24",
        replaces_entry_id=recurring["id"],
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    assert response.status_code == 200
    day = response.json()["days"]["2026-08-24"]

    assert day["status"] == "substituted"
    assert len(day["entries"]) == 1
    entry = day["entries"][0]
    assert entry["workout_id"] is None
    assert entry["name"] == "Active recovery"
    assert entry["status"] == "substituted"
    assert entry["replaced"] == {"entry_id": recurring["id"], "name": "Push"}


# Z. Prompt 10: confine the schedule to the plan's own window


@pytest.mark.asyncio
async def test_unbounded_entry_before_plan_start_is_empty_on_and_after_is_scheduled(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    """The reported bug, directly: an unbounded recurring entry has no
    starts_on of its own to validate against - the read path (Part 1's
    clamp), not create-time validation, is what has to catch this.
    """
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20")  # Thursday
    await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"day_of_week": 7, "name_override": "Rest day"},  # unbounded recurring Sunday
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-16", "to": "2026-08-30"}
    )
    assert response.status_code == 200
    days = response.json()["days"]

    # every date in the range is present as a key, in or out of window
    assert set(days.keys()) == {f"2026-08-{d:02d}" for d in range(16, 31)}

    # 2026-08-16 is a Sunday, before the plan starts (2026-08-20) - clamped
    assert days["2026-08-16"]["status"] == "empty"
    assert days["2026-08-16"]["entries"] == []

    # 2026-08-23 is the first Sunday on/after the plan's start - resolves normally
    assert days["2026-08-23"]["status"] == "scheduled"
    assert days["2026-08-23"]["entries"][0]["name"] == "Rest day"


@pytest.mark.asyncio
async def test_unbounded_entry_after_plan_end_is_empty(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    """Symmetric case: past ends_on clamps too."""
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20", ends_on="2026-08-27")
    await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"day_of_week": 7, "name_override": "Rest day"},
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-23", "to": "2026-09-06"}
    )
    assert response.status_code == 200
    days = response.json()["days"]

    assert days["2026-08-23"]["status"] == "scheduled"  # within window
    assert days["2026-08-30"]["status"] == "empty"  # past plan.ends_on (08-27)
    assert days["2026-08-30"]["entries"] == []


@pytest.mark.asyncio
async def test_plan_with_no_end_date_has_no_upper_bound(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20", ends_on=None)
    await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"day_of_week": 7, "name_override": "Rest day"},
    )

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2027-08-01", "to": "2027-08-07"}
    )
    assert response.status_code == 200
    days = response.json()["days"]
    assert any(day["status"] == "scheduled" for day in days.values())


@pytest.mark.asyncio
async def test_narrowing_plan_start_clamps_a_cancelled_day_to_empty(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """Editing a plan's dates so an existing entry falls outside the new
    window is permitted and doesn't cascade (explicitly out of scope) - but
    Part 1's clamp must still apply uniformly regardless of which of the four
    day states the date would otherwise have resolved to. This one: cancelled.
    """
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20")
    workout = await make_workout(client, plan["id"], name="Push")
    recurring = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    await make_entry(client, plan["id"], on_date="2026-08-24", replaces_entry_id=recurring["id"])

    before = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    assert before.json()["days"]["2026-08-24"]["status"] == "cancelled"

    patched = await client.patch(f"/plans/{plan['id']}", json={"starts_on": "2026-08-25"})
    assert patched.status_code == 200

    after = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    day = after.json()["days"]["2026-08-24"]
    assert day["status"] == "empty"
    assert day["entries"] == []
    assert day["cancelled"] == []


@pytest.mark.asyncio
async def test_narrowing_plan_start_clamps_a_substituted_day_to_empty(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """Same as above, for the substituted state."""
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20")
    original = await make_workout(client, plan["id"], name="Push")
    substitute = await make_workout(client, plan["id"], name="Yoga")
    recurring = await make_entry(client, plan["id"], workout_id=original["id"], day_of_week=1)
    await make_entry(
        client,
        plan["id"],
        workout_id=substitute["id"],
        on_date="2026-08-24",
        replaces_entry_id=recurring["id"],
    )

    before = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    assert before.json()["days"]["2026-08-24"]["status"] == "substituted"

    patched = await client.patch(f"/plans/{plan['id']}", json={"starts_on": "2026-08-25"})
    assert patched.status_code == 200

    after = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-24", "to": "2026-08-24"}
    )
    day = after.json()["days"]["2026-08-24"]
    assert day["status"] == "empty"
    assert day["entries"] == []


@pytest.mark.asyncio
async def test_create_recurring_entry_with_bounds_outside_plan_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    """Regression case from the task: an entry whose window opens before its
    plan does.
    """
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20", ends_on="2026-08-27")
    workout = await make_workout(client, plan["id"])

    before_start = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={
            "workout_id": workout["id"],
            "day_of_week": 1,
            "starts_on": "2026-08-01",
            "ends_on": "2026-08-25",
        },
    )
    assert before_start.status_code == 422

    after_end = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={
            "workout_id": workout["id"],
            "day_of_week": 1,
            "starts_on": "2026-08-21",
            "ends_on": "2026-09-15",
        },
    )
    assert after_end.status_code == 422


@pytest.mark.asyncio
async def test_create_recurring_entry_with_bounds_within_plan_is_201(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20", ends_on="2026-08-27")
    workout = await make_workout(client, plan["id"])

    response = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={
            "workout_id": workout["id"],
            "day_of_week": 1,
            "starts_on": "2026-08-21",
            "ends_on": "2026-08-26",
        },
    )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_dated_entry_with_on_date_outside_plan_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20", ends_on="2026-08-27")
    workout = await make_workout(client, plan["id"])

    before_start = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "on_date": "2026-08-19"},
    )
    assert before_start.status_code == 422

    after_end = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"workout_id": workout["id"], "on_date": "2026-08-28"},
    )
    assert after_end.status_code == 422


@pytest.mark.asyncio
async def test_patch_entry_starts_on_outside_plan_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20", ends_on="2026-08-27")
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry['id']}",
        json={"starts_on": "2026-08-01"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_dated_entry_on_date_outside_plan_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20", ends_on="2026-08-27")
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], on_date="2026-08-22")

    response = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{entry['id']}",
        json={"on_date": "2026-08-30"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_pre_existing_out_of_window_entry_resolves_empty_not_erroring(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    session: Any,
) -> None:
    """Simulates a row that predates this validation - inserted directly via
    the session, bypassing create_entry's window check entirely, the same way
    an already-existing row would never have been checked. The read path
    (Part 1's clamp) must handle it gracefully rather than erroring.
    """
    client, _user = authed_client
    plan = await make_plan(client, starts_on="2026-08-20")
    workout_resp = await make_workout(client, plan["id"], name="Legacy")

    entry = ScheduleEntry(
        plan_id=uuid.UUID(plan["id"]),
        workout_id=uuid.UUID(workout_resp["id"]),
        on_date=date(2026, 8, 10),  # before the plan's starts_on of 08-20
    )
    session.add(entry)
    await session.commit()

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": "2026-08-10", "to": "2026-08-10"}
    )
    assert response.status_code == 200
    day = response.json()["days"]["2026-08-10"]
    assert day["status"] == "empty"
    assert day["entries"] == []
