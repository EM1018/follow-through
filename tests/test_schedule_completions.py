"""Integration between the schedule endpoint and completions: 
the schedule response's `completed`/`completion_id` fields, the
fixed query count regardless of window width, and the cancel/complete
mutual-exclusion invariant enforced from both directions.
"""

import contextlib
from collections.abc import Iterator
from datetime import date, timedelta
from typing import Any
from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import event
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.completion import Completion
from tests.conftest import test_engine


def _switch_user(user: CurrentUser) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def _days_after(start_iso: str, days: int) -> str:
    return (date.fromisoformat(start_iso) + timedelta(days=days)).isoformat()


@contextlib.contextmanager
def _count_statements() -> Iterator[list[int]]:
    """Counts actual SQL statements sent to the DB during the `with` block -
    used to prove the schedule endpoint's query count doesn't scale with
    window width, since asserting an exact literal count would be fragile to
    unrelated changes elsewhere in the dependency chain.
    """
    counter = [0]

    def _on_execute(_conn, _cursor, _statement, _parameters, _context, _executemany) -> None:
        counter[0] += 1

    event.listen(test_engine.sync_engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(test_engine.sync_engine, "before_cursor_execute", _on_execute)


# A. GET /schedule: completed and completion_id


@pytest.mark.asyncio
async def test_day_with_all_entries_logged_is_completed(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    on_date = plan["starts_on"]
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], on_date=on_date)

    completion = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": on_date}
    )
    assert completion.status_code == 201, completion.text

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": on_date, "to": on_date}
    )
    assert response.status_code == 200, response.text
    day = response.json()["days"][on_date]
    assert day["completed"] is True
    assert day["entries"][0]["completion_id"] == completion.json()["id"]


@pytest.mark.asyncio
async def test_day_with_nothing_logged_is_not_completed(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    on_date = plan["starts_on"]
    await make_entry(client, plan["id"], workout_id=workout["id"], on_date=on_date)

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": on_date, "to": on_date}
    )
    assert response.status_code == 200, response.text
    day = response.json()["days"][on_date]
    assert day["completed"] is False
    assert day["entries"][0]["completion_id"] is None


@pytest.mark.asyncio
async def test_query_count_does_not_scale_with_window_width(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    today = plan["starts_on"]
    with _count_statements() as narrow:
        narrow_response = await client.get(
            f"/plans/{plan['id']}/schedule", params={"from": today, "to": today}
        )
    assert narrow_response.status_code == 200

    wide_to = _days_after(today, 91)  # 92-day window, the max allowed
    with _count_statements() as wide:
        wide_response = await client.get(
            f"/plans/{plan['id']}/schedule", params={"from": today, "to": wide_to}
        )
    assert wide_response.status_code == 200

    assert narrow[0] == wide[0]


@pytest.mark.asyncio
async def test_second_users_completion_on_same_entry_id_does_not_appear(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """second_user can't actually create a completion against user_a's entry
    (ownership 404s), but this proves the schedule query is user-scoped on
    its own merits, not just accidentally correct because nothing else exists.
    """
    client, user_a = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    on_date = plan["starts_on"]
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], on_date=on_date)

    _switch_user(second_user)
    denied = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": on_date}
    )
    assert denied.status_code == 404
    _switch_user(user_a)

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": on_date, "to": on_date}
    )
    assert response.status_code == 200, response.text
    day = response.json()["days"][on_date]
    assert day["completed"] is False
    assert day["entries"][0]["completion_id"] is None


@pytest.mark.asyncio
async def test_standalone_completion_never_affects_the_schedule(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """The contribution graph counts everything; the schedule only counts
    entry-linked completions. These are two different notions of "completed"
    and must not be conflated.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    on_date = plan["starts_on"]
    await make_entry(client, plan["id"], workout_id=workout["id"], on_date=on_date)

    standalone = await client.post(
        "/completions", json={"activity": "running", "on_date": on_date}
    )
    assert standalone.status_code == 201, standalone.text

    response = await client.get(
        f"/plans/{plan['id']}/schedule", params={"from": on_date, "to": on_date}
    )
    assert response.status_code == 200, response.text
    day = response.json()["days"][on_date]
    assert day["completed"] is False
    assert day["entries"][0]["completion_id"] is None


# B. cancel / complete mutual exclusion


@pytest.mark.asyncio
async def test_cancelling_an_entry_already_completed_on_that_date_is_409(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    on_date = plan["starts_on"]

    completed = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": on_date}
    )
    assert completed.status_code == 201, completed.text

    cancellation = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"on_date": on_date, "replaces_entry_id": entry["id"]},
    )
    assert cancellation.status_code == 409


@pytest.mark.asyncio
async def test_patching_replaces_entry_id_onto_a_completed_date_is_409(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """Same invariant, reached via PATCH rather than POST - replaces_entry_id
    can only be set on an already-dated entry (the kind-lock rule), so this
    starts as a plain one-off and gets turned into a cancellation in place.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    on_date = plan["starts_on"]

    completed = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": on_date}
    )
    assert completed.status_code == 201, completed.text

    one_off = await make_entry(client, plan["id"], workout_id=workout["id"], on_date=on_date)

    patched = await client.patch(
        f"/plans/{plan['id']}/schedule-entries/{one_off['id']}",
        json={"replaces_entry_id": entry["id"]},
    )
    assert patched.status_code == 409


@pytest.mark.asyncio
async def test_cancelling_a_different_date_on_the_same_recurring_entry_succeeds(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """The date-scoping test: a completion on one Monday must not block
    cancelling a different Monday on the same recurring row.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)

    logged_date = plan["starts_on"]
    other_monday = _days_after(logged_date, 7)

    completed = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": logged_date}
    )
    assert completed.status_code == 201, completed.text

    cancellation = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"on_date": other_monday, "replaces_entry_id": entry["id"]},
    )
    assert cancellation.status_code == 201, cancellation.text


@pytest.mark.asyncio
async def test_completing_an_already_cancelled_date_is_409(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    on_date = plan["starts_on"]

    cancellation = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={"on_date": on_date, "replaces_entry_id": entry["id"]},
    )
    assert cancellation.status_code == 201, cancellation.text

    completion = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": on_date}
    )
    assert completion.status_code == 409


@pytest.mark.asyncio
async def test_replacing_an_already_completed_date_is_409(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
) -> None:
    """Same invariant, but via a real replacement (workout_id +
    replaces_entry_id) rather than a bare cancellation - both suppress the
    target the same way.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    original = await make_workout(client, plan["id"], name="Push")
    substitute = await make_workout(client, plan["id"], name="Yoga")
    entry = await make_entry(client, plan["id"], workout_id=original["id"], day_of_week=1)
    on_date = plan["starts_on"]

    completed = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": on_date}
    )
    assert completed.status_code == 201, completed.text

    replacement = await client.post(
        f"/plans/{plan['id']}/schedule-entries",
        json={
            "workout_id": substitute["id"],
            "on_date": on_date,
            "replaces_entry_id": entry["id"],
        },
    )
    assert replacement.status_code == 409


@pytest.mark.asyncio
async def test_deleting_a_completed_entry_still_succeeds(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    make_workout: Any,
    make_entry: Any,
    session: AsyncSession,
) -> None:
    """Deletion stays allowed and unguarded - the completion survives with a
    nulled schedule_entry_id, keeps its label and source, and becomes an
    ordinary standalone log.
    """
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"], name="Leg Day")
    entry = await make_entry(client, plan["id"], workout_id=workout["id"], day_of_week=1)
    on_date = plan["starts_on"]

    completed = await client.post(
        "/completions", json={"schedule_entry_id": entry["id"], "on_date": on_date}
    )
    assert completed.status_code == 201, completed.text
    completion_id = completed.json()["id"]

    deleted = await client.delete(f"/plans/{plan['id']}/schedule-entries/{entry['id']}")
    assert deleted.status_code == 204

    result = await session.exec(select(Completion).where(Completion.id == UUID(completion_id)))
    row = result.one()
    assert row.schedule_entry_id is None
    assert row.source == "scheduled"
    assert row.label == "Leg Day"
