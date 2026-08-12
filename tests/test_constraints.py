"""Backstops for the DB-level constraints that Pydantic makes unreachable
through the API by design - these exist to make sure the CHECK/index/FK we're
relying on actually says what we think it says, independent of anything the
request schemas or routers validate.
"""

import uuid
from datetime import UTC, date, datetime

import pytest
import pytest_asyncio
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.plan import Plan
from app.models.schedule_entry import ScheduleEntry
from app.models.user import User
from app.models.workout import Workout

MON, TUE = 1, 2


async def _assert_violates(session: AsyncSession, row: SQLModel, constraint_name: str) -> None:
    session.add(row)
    with pytest.raises(IntegrityError, match=constraint_name):
        await session.commit()
    await session.rollback()


@pytest_asyncio.fixture
async def _entry_parents(session: AsyncSession) -> tuple[Plan, Workout]:
    """A committed user/plan/workout to hang ScheduleEntry rows off of -
    inserted through the session directly since this file isn't testing the API.
    """
    user = User(id=uuid.uuid4(), email="constraints@example.com")
    session.add(user)
    await session.commit()

    plan = Plan(
        user_id=user.id,
        name="Constraint Test Plan",
        is_active=True,
        starts_on=datetime.now(UTC).date(),
    )
    session.add(plan)
    await session.commit()

    workout = Workout(plan_id=plan.id, name="Constraint Test Workout")
    session.add(workout)
    await session.commit()

    return plan, workout


@pytest_asyncio.fixture
async def _other_plan_entry_parents(session: AsyncSession) -> tuple[Workout, ScheduleEntry]:
    """A second, unrelated plan (with its own user, workout, and entry) - used
    to prove a schedule entry can't reference a workout or entry that belongs
    to some *other* plan, even though that workout/entry is perfectly real.
    """
    user = User(id=uuid.uuid4(), email="constraints-other@example.com")
    session.add(user)
    await session.commit()

    plan = Plan(
        user_id=user.id,
        name="Other Plan",
        is_active=True,
        starts_on=datetime.now(UTC).date(),
    )
    session.add(plan)
    await session.commit()

    workout = Workout(plan_id=plan.id, name="Other Plan's Workout")
    session.add(workout)
    await session.commit()

    entry = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=MON)
    session.add(entry)
    await session.commit()

    return workout, entry


async def test_day_of_week_above_range_violates_check(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    entry = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=8)
    await _assert_violates(session, entry, "ck_schedule_entries_day_of_week_range")


async def test_day_of_week_below_range_violates_check(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    entry = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=0)
    await _assert_violates(session, entry, "ck_schedule_entries_day_of_week_range")


async def test_day_of_week_and_on_date_both_set_violates_xor(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    entry = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        day_of_week=MON,
        on_date=date(2026, 8, 10),
    )
    await _assert_violates(session, entry, "ck_schedule_entries_day_xor_date")


async def test_neither_day_of_week_nor_on_date_violates_xor(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    entry = ScheduleEntry(plan_id=plan.id, workout_id=workout.id)
    await _assert_violates(session, entry, "ck_schedule_entries_day_xor_date")


async def test_ends_on_before_starts_on_violates_check(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    entry = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        day_of_week=MON,
        starts_on=date(2026, 8, 20),
        ends_on=date(2026, 8, 10),
    )
    await _assert_violates(session, entry, "ck_schedule_entries_ends_after_starts")


async def test_no_workout_no_override_no_replaces_violates_check(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, _workout = _entry_parents
    entry = ScheduleEntry(plan_id=plan.id, day_of_week=MON)
    await _assert_violates(session, entry, "ck_schedule_entries_workout_or_override")


async def test_replaces_entry_id_on_recurring_entry_violates_check(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    target = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=MON)
    session.add(target)
    await session.commit()

    entry = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        day_of_week=TUE,
        replaces_entry_id=target.id,
    )
    await _assert_violates(session, entry, "ck_schedule_entries_replaces_requires_date")


async def test_self_replace_violates_check(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    entry_id = uuid.uuid4()
    entry = ScheduleEntry(
        id=entry_id,
        plan_id=plan.id,
        workout_id=workout.id,
        on_date=date(2026, 8, 10),
        replaces_entry_id=entry_id,
    )
    await _assert_violates(session, entry, "ck_schedule_entries_no_self_replace")


async def test_on_date_with_starts_on_violates_dated_has_no_bounds(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    plan, workout = _entry_parents
    entry = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        on_date=date(2026, 8, 10),
        starts_on=date(2026, 8, 1),
    )
    await _assert_violates(session, entry, "ck_schedule_entries_dated_has_no_bounds")


async def test_cancellation_row_commits_successfully(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    """Positive control: this is the exact row shape ck_schedule_entries_workout_or_override
    was relaxed to permit - no workout_id, no name_override, only replaces_entry_id.
    If this fails, the relaxation in the Stage B migration is wrong.
    """
    plan, workout = _entry_parents
    target = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=MON)
    session.add(target)
    await session.commit()

    cancellation = ScheduleEntry(
        plan_id=plan.id, on_date=date(2026, 8, 10), replaces_entry_id=target.id
    )
    session.add(cancellation)
    await session.commit()

    assert cancellation.id is not None


async def test_second_active_plan_for_same_user_violates_unique_index(
    session: AsyncSession,
) -> None:
    user = User(id=uuid.uuid4(), email="two-active-plans@example.com")
    session.add(user)
    await session.commit()

    plan_a = Plan(
        user_id=user.id, name="Plan A", is_active=True, starts_on=datetime.now(UTC).date()
    )
    session.add(plan_a)
    await session.commit()

    plan_b = Plan(
        user_id=user.id, name="Plan B", is_active=True, starts_on=datetime.now(UTC).date()
    )
    session.add(plan_b)
    with pytest.raises(IntegrityError, match="ix_plans_one_active_per_user"):
        await session.commit()
    await session.rollback()


async def test_workout_id_from_a_different_plan_violates_composite_fk(
    session: AsyncSession,
    _entry_parents: tuple[Plan, Workout],
    _other_plan_entry_parents: tuple[Workout, ScheduleEntry],
) -> None:
    """The old single-column FK (workout_id -> workouts.id) only confirmed the
    workout existed somewhere; the router's _get_plan_workout was the only
    thing stopping this. The composite FK makes it a DB-level guarantee.
    """
    plan, _workout = _entry_parents
    other_workout, _other_entry = _other_plan_entry_parents

    entry = ScheduleEntry(plan_id=plan.id, workout_id=other_workout.id, day_of_week=TUE)
    await _assert_violates(session, entry, "schedule_entries_workout_id_fkey")


async def test_replaces_entry_id_from_a_different_plan_violates_composite_fk(
    session: AsyncSession,
    _entry_parents: tuple[Plan, Workout],
    _other_plan_entry_parents: tuple[Workout, ScheduleEntry],
) -> None:
    """Same reasoning, self-referencing: replaces_entry_id could previously
    point at an entry in any plan, even a different user's.
    """
    plan, workout = _entry_parents
    _other_workout, other_entry = _other_plan_entry_parents

    entry = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        on_date=date(2026, 8, 10),
        replaces_entry_id=other_entry.id,
    )
    await _assert_violates(session, entry, "schedule_entries_replaces_entry_id_fkey")


async def test_workout_id_and_name_override_together_violates_check(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    """ck_schedule_entries_workout_or_override is an OR - it never forbade
    setting both. The app forbids it; this is the same rule as a DB guarantee.
    """
    plan, workout = _entry_parents
    entry = ScheduleEntry(
        plan_id=plan.id, workout_id=workout.id, name_override="Sneaky", day_of_week=TUE
    )
    await _assert_violates(session, entry, "ck_schedule_entries_workout_excludes_override")


async def test_replacement_workout_id_and_name_override_still_mutually_exclusive(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    """The new CHECK must not accidentally block a plain replacement (workout_id
    + replaces_entry_id) or a name-only replacement (name_override +
    replaces_entry_id) - only workout_id + name_override together is forbidden.
    """
    plan, workout = _entry_parents
    target = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=MON)
    session.add(target)
    await session.commit()

    replacement = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        on_date=date(2026, 8, 10),
        replaces_entry_id=target.id,
    )
    session.add(replacement)
    await session.commit()
    assert replacement.id is not None

    name_only_replacement = ScheduleEntry(
        plan_id=plan.id,
        name_override="Recovery walk",
        on_date=date(2026, 8, 17),
        replaces_entry_id=target.id,
    )
    session.add(name_only_replacement)
    await session.commit()
    assert name_only_replacement.id is not None


async def test_plan_ends_on_before_starts_on_violates_check(session: AsyncSession) -> None:
    user = User(id=uuid.uuid4(), email="plan-dates@example.com")
    session.add(user)
    await session.commit()

    plan = Plan(
        user_id=user.id,
        name="Bad Plan",
        is_active=False,
        starts_on=date(2026, 8, 20),
        ends_on=date(2026, 8, 1),
    )
    await _assert_violates(session, plan, "ck_plans_ends_after_starts")


async def test_day_of_week_at_upper_bound_commits_successfully(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    """Positive control for day_of_week_range's inclusive upper bound (7,
    Sunday). Nothing else in the suite ever writes day_of_week=7 to the
    database - test_resolution.py's Sunday scenarios are pure in-memory
    ScheduleEntry objects, never persisted via a session. A mutation narrowing
    the range to 1-6 previously produced a fully green suite; this closes that.
    """
    plan, workout = _entry_parents
    entry = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=7)
    session.add(entry)
    await session.commit()
    assert entry.day_of_week == 7


async def test_ends_on_equal_to_starts_on_commits_successfully(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    """Positive control for the >= boundary on ck_schedule_entries_ends_after_starts -
    equal dates (a single-day active window) are explicitly allowed, but were
    never exercised: a >= -> > mutation would have gone undetected.
    """
    plan, workout = _entry_parents
    entry = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        day_of_week=MON,
        starts_on=date(2026, 8, 10),
        ends_on=date(2026, 8, 10),
    )
    session.add(entry)
    await session.commit()
    assert entry.id is not None


async def test_plan_ends_on_equal_to_starts_on_commits_successfully(
    session: AsyncSession,
) -> None:
    """Same boundary gap as above, for ck_plans_ends_after_starts."""
    user = User(id=uuid.uuid4(), email="plan-same-day@example.com")
    session.add(user)
    await session.commit()

    plan = Plan(
        user_id=user.id,
        name="Same Day Plan",
        is_active=False,
        starts_on=date(2026, 8, 10),
        ends_on=date(2026, 8, 10),
    )
    session.add(plan)
    await session.commit()
    assert plan.id is not None


async def test_on_date_with_ends_on_violates_dated_has_no_bounds(
    session: AsyncSession, _entry_parents: tuple[Plan, Workout]
) -> None:
    """PAIR with test_on_date_with_starts_on_violates_dated_has_no_bounds. The
    CHECK is an AND of two independent NULL checks (starts_on IS NULL AND
    ends_on IS NULL) - a test that only ever exercises the starts_on half
    wouldn't catch a mutation that dropped the ends_on half.
    """
    plan, workout = _entry_parents
    entry = ScheduleEntry(
        plan_id=plan.id,
        workout_id=workout.id,
        on_date=date(2026, 8, 10),
        ends_on=date(2026, 8, 20),
    )
    await _assert_violates(session, entry, "ck_schedule_entries_dated_has_no_bounds")


async def test_duplicate_username_violates_unique_index(session: AsyncSession) -> None:
    """username is never set through any endpoint at all (no schema exposes
    it), so this uniqueness guarantee was completely untested anywhere else.
    """
    session.add(User(id=uuid.uuid4(), email="a@example.com", username="sam"))
    await session.commit()

    duplicate = User(id=uuid.uuid4(), email="b@example.com", username="sam")
    await _assert_violates(session, duplicate, "ix_users_username")


async def test_deleting_user_cascades_to_plans(session: AsyncSession) -> None:
    """No endpoint deletes a user, so plans_user_id_fkey's ON DELETE CASCADE was
    otherwise completely unreachable and untested - exactly the kind of
    silently-NO-ACTION risk this stage was meant to close everywhere else.
    """
    user = User(id=uuid.uuid4(), email="deleteme@example.com")
    session.add(user)
    await session.commit()

    plan = Plan(
        user_id=user.id, name="Doomed Plan", is_active=True, starts_on=datetime.now(UTC).date()
    )
    session.add(plan)
    await session.commit()
    plan_id = plan.id

    await session.delete(user)
    await session.commit()

    # session.get() would return the stale object from the identity map
    # without re-querying - a fresh select() actually hits the DB.
    result = await session.exec(select(Plan).where(Plan.id == plan_id))
    assert list(result) == []
