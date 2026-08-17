"""Cheap guards over app/services/activities.py's static vocabulary tables -
fail loudly when someone adds an Activity or Unit later and forgets half the
wiring (a unit with no dimension, an activity with no permitted-units entry,
a default that isn't itself permitted).
"""

import pytest

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
