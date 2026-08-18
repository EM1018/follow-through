from datetime import UTC, datetime, timedelta
from decimal import Decimal
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
    assert body["value"] == 20.0
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
    assert body["value"] == 3.0
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


# E. source


@pytest.mark.asyncio
async def test_source_is_scheduled_when_entry_linked(
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
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)}
    )
    assert response.status_code == 201, response.text
    assert response.json()["source"] == "scheduled"


@pytest.mark.asyncio
async def test_source_is_standalone_when_no_entry(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    assert response.status_code == 201, response.text
    assert response.json()["source"] == "standalone"


@pytest.mark.asyncio
async def test_source_in_post_body_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"activity": "running", "on_date": str(TODAY), "source": "scheduled"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_source_in_patch_body_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    created = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    response = await client.patch(
        f"/completions/{completion_id}", json={"source": "standalone"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_deleting_schedule_entry_keeps_source_scheduled(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
    session: AsyncSession,
) -> None:
    """The one that matters: schedule_entry_id gets nulled by the delete, but
    source must still read as "scheduled" - it's a snapshot, not derived.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    created = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)}
    )
    completion_id = created.json()["id"]

    await client.delete(f"/plans/{plan['id']}/schedule-entries/{entry['id']}")

    result = await session.exec(
        select(Completion).where(Completion.id == UUID(completion_id))
    )
    row = result.one()
    assert row.schedule_entry_id is None
    assert row.source == "scheduled"


@pytest.mark.asyncio
async def test_deleting_workout_cascades_but_keeps_source_scheduled(
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

    await client.delete(f"/plans/{plan['id']}/workouts/{workout['id']}")

    result = await session.exec(
        select(Completion).where(Completion.id == UUID(completion_id))
    )
    row = result.one()
    assert row.schedule_entry_id is None
    assert row.source == "scheduled"


# F. value on the wire


@pytest.mark.asyncio
async def test_value_serializes_as_a_number_not_a_decimal_string(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"activity": "running", "value": "10", "unit": "miles", "on_date": str(TODAY)},
    )
    assert response.status_code == 201, response.text
    value = response.json()["value"]
    assert isinstance(value, float)
    assert value == 10.0


@pytest.mark.asyncio
async def test_value_round_trips_a_fractional_amount(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.post(
        "/completions",
        json={"activity": "running", "value": "3.2", "unit": "miles", "on_date": str(TODAY)},
    )
    assert response.status_code == 201, response.text
    assert response.json()["value"] == 3.2


@pytest.mark.asyncio
async def test_stored_value_column_is_still_decimal(
    authed_client: tuple[AsyncClient, CurrentUser],
    session: AsyncSession,
) -> None:
    """The wire format changed (Stage 2); the column and its exactness
    guarantee - needed for the future value >= target comparison - did not.
    """
    client, _user = authed_client
    created = await client.post(
        "/completions",
        json={"activity": "running", "value": "3.2", "unit": "miles", "on_date": str(TODAY)},
    )
    completion_id = created.json()["id"]

    result = await session.exec(
        select(Completion).where(Completion.id == UUID(completion_id))
    )
    row = result.one()
    assert isinstance(row.value, Decimal)
    assert row.value == Decimal("3.20")


# G. GET /completions


@pytest.mark.asyncio
async def test_returns_own_completions_not_second_users(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
) -> None:
    client, user_a = authed_client
    mine = await client.post("/completions", json={"activity": "running", "on_date": str(TODAY)})
    assert mine.status_code == 201, mine.text

    _switch_user(second_user)
    theirs = await client.post(
        "/completions", json={"activity": "walking", "on_date": str(TODAY)}
    )
    assert theirs.status_code == 201, theirs.text
    _switch_user(user_a)

    response = await client.get(
        "/completions", params={"from": str(TODAY), "to": str(TODAY)}
    )
    assert response.status_code == 200, response.text
    ids = {row["id"] for row in response.json()}
    assert mine.json()["id"] in ids
    assert theirs.json()["id"] not in ids


@pytest.mark.asyncio
async def test_both_boundary_dates_included(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    from_ = YESTERDAY
    to = TODAY
    start = await client.post(
        "/completions", json={"activity": "running", "on_date": str(from_)}
    )
    end = await client.post("/completions", json={"activity": "walking", "on_date": str(to)})

    response = await client.get("/completions", params={"from": str(from_), "to": str(to)})
    assert response.status_code == 200, response.text
    ids = {row["id"] for row in response.json()}
    assert start.json()["id"] in ids
    assert end.json()["id"] in ids


@pytest.mark.asyncio
async def test_ordering_is_on_date_desc_then_created_at_desc(
    authed_client: tuple[AsyncClient, CurrentUser],
    session: AsyncSession,
) -> None:
    client, _user = authed_client
    older_day = await client.post(
        "/completions", json={"activity": "running", "on_date": str(YESTERDAY)}
    )
    same_day_first = await client.post(
        "/completions", json={"activity": "walking", "on_date": str(TODAY)}
    )
    same_day_second = await client.post(
        "/completions", json={"activity": "cycling", "on_date": str(TODAY)}
    )

    # created_at is server-assigned; force an unambiguous gap rather than
    # relying on wall-clock timing between two POSTs a few lines apart.
    first_row = await session.get(Completion, UUID(same_day_first.json()["id"]))
    second_row = await session.get(Completion, UUID(same_day_second.json()["id"]))
    first_row.created_at = datetime.now(UTC) - timedelta(minutes=5)
    second_row.created_at = datetime.now(UTC)
    session.add_all([first_row, second_row])
    await session.commit()

    response = await client.get(
        "/completions", params={"from": str(YESTERDAY), "to": str(TODAY)}
    )
    assert response.status_code == 200, response.text
    ids = [row["id"] for row in response.json()]
    assert ids == [
        same_day_second.json()["id"],
        same_day_first.json()["id"],
        older_day.json()["id"],
    ]


@pytest.mark.asyncio
async def test_activity_filter_returns_only_matching_rows(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    running = await client.post(
        "/completions", json={"activity": "running", "on_date": str(TODAY)}
    )
    await client.post("/completions", json={"activity": "walking", "on_date": str(TODAY)})

    response = await client.get(
        "/completions",
        params={"from": str(TODAY), "to": str(TODAY), "activity": "running"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert {row["id"] for row in body} == {running.json()["id"]}


@pytest.mark.asyncio
async def test_activity_filter_excludes_null_activity_rows(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    no_activity = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)}
    )
    assert no_activity.json()["activity"] is None

    response = await client.get(
        "/completions",
        params={"from": str(TODAY), "to": str(TODAY), "activity": "running"},
    )
    assert response.status_code == 200, response.text
    assert no_activity.json()["id"] not in {row["id"] for row in response.json()}


@pytest.mark.asyncio
async def test_93_day_window_is_422_92_day_window_is_200(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client

    too_wide = await client.get(
        "/completions",
        params={"from": str(TODAY - timedelta(days=92)), "to": str(TODAY)},
    )
    assert too_wide.status_code == 422

    max_width = await client.get(
        "/completions",
        params={"from": str(TODAY - timedelta(days=91)), "to": str(TODAY)},
    )
    assert max_width.status_code == 200


@pytest.mark.asyncio
async def test_to_before_from_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.get(
        "/completions", params={"from": str(TODAY), "to": str(YESTERDAY)}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_missing_from_or_to_is_422(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    assert (
        await client.get("/completions", params={"to": str(TODAY)})
    ).status_code == 422
    assert (
        await client.get("/completions", params={"from": str(TODAY)})
    ).status_code == 422


@pytest.mark.asyncio
async def test_empty_range_returns_empty_list_not_404(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    far_past = TODAY - timedelta(days=365)
    response = await client.get(
        "/completions", params={"from": str(far_past), "to": str(far_past)}
    )
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_completion_with_deleted_entry_still_appears(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"])

    created = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": str(TODAY)}
    )
    await client.delete(f"/plans/{plan['id']}/schedule-entries/{entry['id']}")

    response = await client.get(
        "/completions", params={"from": str(TODAY), "to": str(TODAY)}
    )
    assert response.status_code == 200, response.text
    by_id = {row["id"]: row for row in response.json()}
    assert created.json()["id"] in by_id
    assert by_id[created.json()["id"]]["schedule_entry_id"] is None
    assert by_id[created.json()["id"]]["source"] == "scheduled"
