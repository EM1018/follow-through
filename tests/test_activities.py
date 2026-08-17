"""Cheap guards over app/services/activities.py's static vocabulary tables -
fail loudly when someone adds an Activity or Unit later and forgets half the
wiring (a unit with no dimension, an activity with no permitted-units entry,
a default that isn't itself permitted).
"""

import pytest
from httpx import AsyncClient

from app.deps import CurrentUser
from app.services.activities import ACTIVITY_UNITS, UNIT_DIMENSION, Activity, Unit


@pytest.mark.parametrize("unit", list(Unit))
def test_every_unit_has_a_dimension(unit: Unit) -> None:
    assert unit in UNIT_DIMENSION


@pytest.mark.parametrize("activity", list(Activity))
def test_every_activity_has_permitted_units(activity: Activity) -> None:
    assert activity in ACTIVITY_UNITS


@pytest.mark.parametrize("activity", list(Activity))
def test_every_activity_default_unit_is_permitted(activity: Activity) -> None:
    activity_units = ACTIVITY_UNITS[activity]
    assert activity_units.default in activity_units.permitted


def test_every_permitted_unit_across_all_activities_has_a_dimension() -> None:
    for activity_units in ACTIVITY_UNITS.values():
        for unit in activity_units.permitted:
            assert unit in UNIT_DIMENSION


# GET /activities


@pytest.mark.asyncio
async def test_every_activity_appears_with_a_display_name(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.get("/activities")
    assert response.status_code == 200

    body = response.json()
    by_activity = {row["activity"]: row for row in body["activities"]}
    for activity in Activity:
        assert activity.value in by_activity
        assert by_activity[activity.value]["display_name"]


@pytest.mark.asyncio
async def test_each_activity_default_unit_is_in_its_own_units_list(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.get("/activities")
    body = response.json()

    for row in body["activities"]:
        assert row["default_unit"] in row["units"]


@pytest.mark.asyncio
async def test_units_list_covers_every_unit_with_a_dimension(
    authed_client: tuple[AsyncClient, CurrentUser],
) -> None:
    client, _user = authed_client
    response = await client.get("/activities")
    body = response.json()

    by_unit = {row["unit"]: row for row in body["units"]}
    for unit in Unit:
        assert unit.value in by_unit
        assert by_unit[unit.value]["dimension"]


@pytest.mark.asyncio
async def test_unauthenticated_request_is_401(client: AsyncClient) -> None:
    assert (await client.get("/activities")).status_code == 401
