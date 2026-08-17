from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.completion import Completion
from app.models.schedule_entry import ScheduleEntry

TODAY = datetime.now(UTC).date()
YESTERDAY = TODAY - timedelta(days=1)
TOMORROW = TODAY + timedelta(days=1)


def _switch_user(user: CurrentUser) -> None:
    """See test_schedule_entries.py's _switch_user for why this reassigns the
    shared override rather than using a second client.
    """
    app.dependency_overrides[get_current_user] = lambda: user


# A. standalone completions


@pytest.mark.asyncio
async def test_standalone_completion_with_activity_and_amount(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"activity": "running", "value": "3.5", "unit": "miles", "on_date": str(TODAY)},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["label"] == "Running"
    assert body["activity"] == "running"
    assert body["unit"] == "miles"
    assert body["schedule_entry_id"] is None


@pytest.mark.asyncio
async def test_amount_with_null_activity_is_allowed(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """A workout with no activity can still record an amount for the user's
    own history - it just satisfies no goal. activity is only *required* when
    there's no schedule_entry_id to anchor the completion to instead.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    response = await client.post(
        "/completions",
        json={
            "schedule_entry_id": entry["id"],
            "value": "45",
            "unit": "minutes",
            "on_date": str(TODAY),
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["activity"] is None


@pytest.mark.asyncio
async def test_no_activity_and_no_entry_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post("/completions", json={"on_date": str(TODAY)})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_miles_of_stretching_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={
            "activity": "stretching_mobility",
            "value": "5",
            "unit": "miles",
            "on_date": str(TODAY),
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_value_without_unit_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"activity": "running", "value": "3", "on_date": str(TODAY)},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_unit_without_value_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"activity": "running", "unit": "miles", "on_date": str(TODAY)},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_on_date_tomorrow_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TOMORROW)}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_label_in_request_body_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    """label is derived server-side, never accepted from the client -
    extra="forbid" must reject it.
    """
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"activity": "running", "on_date": str(TODAY), "label": "Sneaky"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_two_valueless_completions_same_date_no_entry_link_both_succeed(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    """Positive control proving the partial unique index doesn't apply to
    standalone logs, exercised through the real endpoint this time.
    """
    client, _user = authed_client
    first = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    second = await client.post(
        "/completions", json={"activity": "walking", "on_date": str(TODAY)}
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text


# B. entry-linked completions


@pytest.mark.asyncio
async def test_entry_linked_completion_label_matches_workout_name(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"], name="Push Day")
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    response = await client.post(
        "/completions",
        json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["label"] == "Push Day"
    assert body["schedule_entry_id"] == entry["id"]
    assert body["value"] is None
    assert body["unit"] is None


@pytest.mark.asyncio
async def test_entry_linked_completion_with_name_override_label(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    entry = await make_entry(client, plan["id"], name_override="Recovery walk")

    response = await client.post(
        "/completions",
        json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)},
    )
    assert response.status_code == 201, response.text
    assert response.json()["label"] == "Recovery walk"


@pytest.mark.asyncio
async def test_valueless_entry_linked_completion_is_one_tap_log(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    response = await client.post(
        "/completions",
        json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["value"] is None
    assert body["unit"] is None


@pytest.mark.asyncio
async def test_entry_linked_completion_against_cancellation_row_falls_back_to_activity(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """Stage B guarantees a real occurrence has a workout_id or name_override,
    but a pure cancellation row (replaces_entry_id only) has neither - logging
    against one is defensive, not a supported flow, but must not crash.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    target = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    cancellation = await make_entry(
        client, plan["id"], on_date=str(TODAY), replaces_entry_id=target["id"]
    )

    with_activity = await client.post(
        "/completions",
        json={
            "schedule_entry_id": cancellation["id"],
            "activity": "running",
            "on_date": str(TODAY),
        },
    )
    assert with_activity.status_code == 201, with_activity.text
    assert with_activity.json()["label"] == "Running"


@pytest.mark.asyncio
async def test_entry_linked_completion_against_cancellation_row_falls_back_to_generic_label(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    target = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    cancellation = await make_entry(
        client, plan["id"], on_date=str(TODAY), replaces_entry_id=target["id"]
    )

    response = await client.post(
        "/completions",
        json={"schedule_entry_id": cancellation["id"], "on_date": str(TODAY)},
    )
    assert response.status_code == 201, response.text
    assert response.json()["label"] == "Workout"


@pytest.mark.asyncio
async def test_another_users_schedule_entry_id_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, user_a = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    _switch_user(second_user)
    response = await client.post(
        "/completions",
        json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)},
    )
    assert response.status_code == 404

    _switch_user(user_a)


@pytest.mark.asyncio
async def test_nonexistent_schedule_entry_id_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"schedule_entry_id": str(uuid4()), "on_date": str(TODAY)},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_duplicate_entry_and_date_is_409(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
    session: AsyncSession,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    first = await client.post(
        "/completions",
        json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)},
    )
    assert first.status_code == 201, first.text

    duplicate = await client.post(
        "/completions",
        json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)},
    )
    assert duplicate.status_code == 409

    result = await session.exec(
        select(Completion).where(Completion.schedule_entry_id == entry["id"])
    )
    assert len(list(result)) == 1


# C. PATCH /completions/{id}


@pytest.mark.asyncio
async def test_patch_adds_amount_to_valueless_row(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """The "Add amount" flow after a one-tap log."""
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    created = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]
    assert created.json()["value"] is None

    response = await client.patch(
        f"/completions/{completion_id}", json={"value": "20", "unit": "minutes"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["value"] == "20.00"
    assert body["unit"] == "minutes"


@pytest.mark.asyncio
async def test_patch_null_value_and_unit_clears_amount(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post(
        "/completions",
        json={"activity": "running", "value": "3", "unit": "miles", "on_date": str(TODAY)},
    )
    completion_id = created.json()["id"]

    response = await client.patch(
        f"/completions/{completion_id}", json={"value": None, "unit": None}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["value"] is None
    assert body["unit"] is None


@pytest.mark.asyncio
async def test_patch_value_alone_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    response = await client.patch(f"/completions/{completion_id}", json={"value": "5"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_note_alone_leaves_amount_untouched(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post(
        "/completions",
        json={"activity": "running", "value": "3", "unit": "miles", "on_date": str(TODAY)},
    )
    completion_id = created.json()["id"]

    response = await client.patch(f"/completions/{completion_id}", json={"note": "Felt good"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["note"] == "Felt good"
    assert body["value"] == "3.00"
    assert body["unit"] == "miles"


@pytest.mark.asyncio
async def test_patch_unit_not_permitted_for_stored_activity_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post(
        "/completions",
        json={
            "activity": "stretching_mobility",
            "value": "10",
            "unit": "minutes",
            "on_date": str(TODAY),
        },
    )
    completion_id = created.json()["id"]

    response = await client.patch(
        f"/completions/{completion_id}", json={"value": "5", "unit": "miles"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_immutable_fields_are_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    for payload in (
        {"activity": "walking"},
        {"on_date": str(YESTERDAY)},
        {"schedule_entry_id": str(uuid4())},
    ):
        response = await client.patch(f"/completions/{completion_id}", json=payload)
        assert response.status_code == 422, payload


@pytest.mark.asyncio
async def test_patch_another_users_completion_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
) -> None:
    client, user_a = authed_client
    created = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    _switch_user(second_user)
    response = await client.patch(f"/completions/{completion_id}", json={"note": "hijacked"})
    assert response.status_code == 404

    _switch_user(user_a)


# D. DELETE /completions/{id}


@pytest.mark.asyncio
async def test_delete_own_completion(
    authed_client: tuple[AsyncClient, CurrentUser],
    session: AsyncSession,
) -> None:
    client, _user = authed_client
    created = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    response = await client.delete(f"/completions/{completion_id}")
    assert response.status_code == 204

    result = await session.exec(select(Completion).where(Completion.id == UUID(completion_id)))
    assert list(result) == []


@pytest.mark.asyncio
async def test_delete_another_users_completion_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
) -> None:
    client, user_a = authed_client
    created = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    _switch_user(second_user)
    response = await client.delete(f"/completions/{completion_id}")
    assert response.status_code == 404

    _switch_user(user_a)


@pytest.mark.asyncio
async def test_delete_completion_leaves_its_schedule_entry_untouched(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
    session: AsyncSession,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    created = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    response = await client.delete(f"/completions/{completion_id}")
    assert response.status_code == 204

    result = await session.exec(
        select(ScheduleEntry).where(ScheduleEntry.id == UUID(entry["id"]))
    )
    assert result.one().id == UUID(entry["id"])
