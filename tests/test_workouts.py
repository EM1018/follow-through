import uuid
from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select

from app.deps import CurrentUser, get_current_user
from app.main import app
from app.models.workout import Workout


def _switch_user(user: CurrentUser) -> None:
    """Reassign the shared get_current_user override to act as a different user
    (see second_user fixture in conftest.py for why this is a reassignment, not a
    second client).
    """
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.mark.asyncio
async def test_create_workout_in_own_plan(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(
        f"/plans/{plan['id']}/workouts", json={"name": "Leg Day", "notes": "focus on depth"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Leg Day"
    assert body["notes"] == "focus on depth"
    assert body["plan_id"] == plan["id"]


@pytest.mark.asyncio
async def test_duplicate_workout_names_allowed(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    first = await client.post(f"/plans/{plan['id']}/workouts", json={"name": "Leg Day"})
    second = await client.post(f"/plans/{plan['id']}/workouts", json={"name": "Leg Day"})

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


@pytest.mark.asyncio
async def test_create_workout_with_and_without_notes(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    with_notes = await client.post(
        f"/plans/{plan['id']}/workouts", json={"name": "Push Day", "notes": "bench, ohp"}
    )
    without_notes = await client.post(f"/plans/{plan['id']}/workouts", json={"name": "Pull Day"})

    assert with_notes.status_code == 201
    assert with_notes.json()["notes"] == "bench, ohp"
    assert without_notes.status_code == 201
    assert without_notes.json()["notes"] is None


@pytest.mark.asyncio
async def test_create_workout_with_smuggled_id_fields_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(
        f"/plans/{plan['id']}/workouts",
        json={"name": "Leg Day", "id": str(uuid4()), "plan_id": str(uuid4())},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_workout_with_smuggled_id_fields_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    created = await client.post(f"/plans/{plan['id']}/workouts", json={"name": "Leg Day"})
    workout_id = created.json()["id"]

    response = await client.patch(
        f"/plans/{plan['id']}/workouts/{workout_id}",
        json={"id": str(uuid4()), "plan_id": str(uuid4())},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_patch_own_workout_updates_and_persists(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    created = await client.post(
        f"/plans/{plan['id']}/workouts", json={"name": "Original", "notes": "old notes"}
    )
    workout_id = created.json()["id"]

    patched = await client.patch(
        f"/plans/{plan['id']}/workouts/{workout_id}",
        json={"name": "Renamed", "notes": "new notes"},
    )

    assert patched.status_code == 200
    assert patched.json()["name"] == "Renamed"
    assert patched.json()["notes"] == "new notes"

    listing = await client.get(f"/plans/{plan['id']}/workouts")
    listed = next(w for w in listing.json() if w["id"] == workout_id)
    assert listed["name"] == "Renamed"
    assert listed["notes"] == "new notes"


@pytest.mark.asyncio
async def test_delete_own_workout_removes_it(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    created = await client.post(f"/plans/{plan['id']}/workouts", json={"name": "Leg Day"})
    workout_id = created.json()["id"]

    deleted = await client.delete(f"/plans/{plan['id']}/workouts/{workout_id}")
    assert deleted.status_code == 204

    listing = await client.get(f"/plans/{plan['id']}/workouts")
    assert listing.status_code == 200
    assert all(w["id"] != workout_id for w in listing.json())


@pytest.mark.asyncio
async def test_list_workouts_scoped_to_plan(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan_a = await make_plan(client, name="Plan A")
    plan_b = await make_plan(client, name="Plan B")

    in_a = await client.post(f"/plans/{plan_a['id']}/workouts", json={"name": "A workout"})
    assert in_a.status_code == 201
    in_b = await client.post(f"/plans/{plan_b['id']}/workouts", json={"name": "B workout"})
    assert in_b.status_code == 201

    listing = await client.get(f"/plans/{plan_a['id']}/workouts")
    assert listing.status_code == 200
    names = {workout["name"] for workout in listing.json()}
    assert names == {"A workout"}


@pytest.mark.asyncio
async def test_user_b_via_a_plan_id_is_404_on_every_route(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
) -> None:
    client, _me = authed_client
    plan_a = await make_plan(client)
    created = await client.post(f"/plans/{plan_a['id']}/workouts", json={"name": "Leg Day"})
    workout_id = created.json()["id"]

    _switch_user(second_user)

    create = await client.post(f"/plans/{plan_a['id']}/workouts", json={"name": "Sneaky"})
    assert create.status_code == 404

    listing = await client.get(f"/plans/{plan_a['id']}/workouts")
    assert listing.status_code == 404

    patched = await client.patch(
        f"/plans/{plan_a['id']}/workouts/{workout_id}", json={"name": "Hijacked"}
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"/plans/{plan_a['id']}/workouts/{workout_id}")
    assert deleted.status_code == 404


@pytest.mark.asyncio
async def test_chain_workout_id_must_belong_to_url_plan_id(
    authed_client: tuple[AsyncClient, CurrentUser],
    second_user: CurrentUser,
    make_plan: Any,
) -> None:
    """The chain test: user B owns a real plan, but A's workout doesn't belong to
    it - fetching A's workout_id through B's own (validly-owned) plan_id must still
    404, proving ownership is checked against the *specific* plan in the URL, not
    just "some plan the requester owns".
    """
    client, me = authed_client
    plan_a = await make_plan(client, name="Plan A")
    created = await client.post(
        f"/plans/{plan_a['id']}/workouts", json={"name": "Original", "notes": "keep me"}
    )
    workout_id = created.json()["id"]

    _switch_user(second_user)
    plan_b = await make_plan(client, name="Plan B")

    patched = await client.patch(
        f"/plans/{plan_b['id']}/workouts/{workout_id}", json={"name": "Hijacked"}
    )
    assert patched.status_code == 404

    deleted = await client.delete(f"/plans/{plan_b['id']}/workouts/{workout_id}")
    assert deleted.status_code == 404

    _switch_user(me)
    unchanged = await client.get(f"/plans/{plan_a['id']}/workouts")
    assert unchanged.status_code == 200
    workouts = unchanged.json()
    assert len(workouts) == 1
    assert workouts[0]["name"] == "Original"
    assert workouts[0]["notes"] == "keep me"


@pytest.mark.asyncio
async def test_nonexistent_workout_id_is_404(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    patched = await client.patch(f"/plans/{plan['id']}/workouts/{uuid4()}", json={"name": "x"})
    assert patched.status_code == 404

    deleted = await client.delete(f"/plans/{plan['id']}/workouts/{uuid4()}")
    assert deleted.status_code == 404


@pytest.mark.asyncio
async def test_nonexistent_plan_id_is_404(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    fake_plan_id = uuid4()
    fake_workout_id = uuid4()

    assert (
        await client.post(f"/plans/{fake_plan_id}/workouts", json={"name": "x"})
    ).status_code == 404
    assert (await client.get(f"/plans/{fake_plan_id}/workouts")).status_code == 404
    assert (
        await client.patch(f"/plans/{fake_plan_id}/workouts/{fake_workout_id}", json={"name": "x"})
    ).status_code == 404
    assert (
        await client.delete(f"/plans/{fake_plan_id}/workouts/{fake_workout_id}")
    ).status_code == 404


@pytest.mark.asyncio
async def test_deleting_plan_cascades_to_workouts(
    authed_client: tuple[AsyncClient, CurrentUser],
    make_plan: Any,
    session: Any,
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    for i in range(3):
        created = await client.post(f"/plans/{plan['id']}/workouts", json={"name": f"Workout {i}"})
        assert created.status_code == 201

    deleted = await client.delete(f"/plans/{plan['id']}")
    assert deleted.status_code == 204

    result = await session.exec(select(Workout).where(Workout.plan_id == uuid.UUID(plan["id"])))
    assert list(result) == []


@pytest.mark.asyncio
async def test_create_workout_with_empty_name_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(f"/plans/{plan['id']}/workouts", json={"name": ""})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_workout_with_too_long_name_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(f"/plans/{plan['id']}/workouts", json={"name": "x" * 101})

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_workout_with_activity_is_persisted(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(
        f"/plans/{plan['id']}/workouts",
        json={"name": "Leg Day", "activity": "strength_training"},
    )

    assert response.status_code == 201, response.text
    assert response.json()["activity"] == "strength_training"


@pytest.mark.asyncio
async def test_create_workout_without_activity_is_null(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(f"/plans/{plan['id']}/workouts", json={"name": "Leg Day"})

    assert response.status_code == 201, response.text
    assert response.json()["activity"] is None


@pytest.mark.asyncio
async def test_patch_activity_onto_existing_workout(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"])
    assert workout["activity"] is None

    response = await client.patch(
        f"/plans/{plan['id']}/workouts/{workout['id']}", json={"activity": "cycling"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["activity"] == "cycling"


@pytest.mark.asyncio
async def test_patch_activity_back_to_null(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any, make_workout: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)
    workout = await make_workout(client, plan["id"], activity="cycling")
    assert workout["activity"] == "cycling"

    response = await client.patch(
        f"/plans/{plan['id']}/workouts/{workout['id']}", json={"activity": None}
    )

    assert response.status_code == 200, response.text
    assert response.json()["activity"] is None


@pytest.mark.asyncio
async def test_create_workout_with_invalid_activity_is_422(
    authed_client: tuple[AsyncClient, CurrentUser], make_plan: Any
) -> None:
    client, _user = authed_client
    plan = await make_plan(client)

    response = await client.post(
        f"/plans/{plan['id']}/workouts", json={"name": "Leg Day", "activity": "teleporting"}
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_unauthenticated_requests_are_401(client: AsyncClient) -> None:
    fake_plan_id = uuid4()
    fake_workout_id = uuid4()

    assert (
        await client.post(f"/plans/{fake_plan_id}/workouts", json={"name": "x"})
    ).status_code == 401
    assert (await client.get(f"/plans/{fake_plan_id}/workouts")).status_code == 401
    assert (
        await client.patch(f"/plans/{fake_plan_id}/workouts/{fake_workout_id}", json={"name": "x"})
    ).status_code == 401
    assert (
        await client.delete(f"/plans/{fake_plan_id}/workouts/{fake_workout_id}")
    ).status_code == 401
