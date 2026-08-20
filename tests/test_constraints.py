"""Backstops for the DB-level constraints that Pydantic makes unreachable
through the API by design - these exist to make sure the CHECK/index/FK we're
relying on actually says what we think it says, independent of anything the
request schemas or routers validate.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
import pytest_asyncio
from sqlalchemy.exc import IntegrityError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.commitment import Commitment, InviteStatus
from app.models.completion import Completion, CompletionSource
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


# Completions


@pytest_asyncio.fixture
async def _completion_parents(session: AsyncSession) -> tuple[User, Workout, ScheduleEntry]:
    """A committed user/plan/workout/entry to hang Completion rows off of."""
    user = User(id=uuid.uuid4(), email="completions@example.com")
    session.add(user)
    await session.commit()

    plan = Plan(
        user_id=user.id,
        name="Completion Test Plan",
        is_active=True,
        starts_on=datetime.now(UTC).date(),
    )
    session.add(plan)
    await session.commit()

    workout = Workout(plan_id=plan.id, name="Completion Test Workout")
    session.add(workout)
    await session.commit()

    entry = ScheduleEntry(plan_id=plan.id, workout_id=workout.id, day_of_week=MON)
    session.add(entry)
    await session.commit()

    return user, workout, entry


async def test_value_without_unit_violates_paired_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Run",
        value=5,
        unit=None,
        source=CompletionSource.STANDALONE,
    )
    await _assert_violates(session, completion, "ck_completions_value_unit_paired")


async def test_unit_without_value_violates_paired_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Run",
        value=None,
        unit="miles",
        source=CompletionSource.STANDALONE,
    )
    await _assert_violates(session, completion, "ck_completions_value_unit_paired")


async def test_value_zero_violates_positive_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Run",
        value=0,
        unit="miles",
        source=CompletionSource.STANDALONE,
    )
    await _assert_violates(session, completion, "ck_completions_value_positive")


async def test_value_negative_violates_positive_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Run",
        value=-5,
        unit="miles",
        source=CompletionSource.STANDALONE,
    )
    await _assert_violates(session, completion, "ck_completions_value_positive")


async def test_activity_not_in_enum_violates_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Run",
        activity="teleporting",
        source=CompletionSource.STANDALONE,
    )
    await _assert_violates(session, completion, "ck_completions_activity_valid")


async def test_unit_not_in_enum_violates_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Run",
        value=5,
        unit="furlongs",
        source=CompletionSource.STANDALONE,
    )
    await _assert_violates(session, completion, "ck_completions_unit_valid")


async def test_unit_sessions_violates_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    """sessions was removed from the Unit vocabulary (Prompt 18) - the CHECK
    constraint was tightened to match, so a row using it is now just as
    invalid as any other string outside the enum.
    """
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Leg Day",
        value=1,
        unit="sessions",
        source=CompletionSource.STANDALONE,
    )
    await _assert_violates(session, completion, "ck_completions_unit_valid")


async def test_invalid_source_violates_check(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, _entry = _completion_parents
    completion = Completion(
        user_id=user.id, on_date=date(2026, 8, 10), label="Run", source="teleported"
    )
    await _assert_violates(session, completion, "ck_completions_source_valid")


async def test_duplicate_entry_and_date_violates_unique_index(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, entry = _completion_parents
    first = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Push",
        schedule_entry_id=entry.id,
        source=CompletionSource.SCHEDULED,
    )
    session.add(first)
    await session.commit()

    duplicate = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Push (again)",
        schedule_entry_id=entry.id,
        source=CompletionSource.SCHEDULED,
    )
    await _assert_violates(session, duplicate, "uq_completions_entry_date")


async def test_two_null_entry_completions_same_date_commit_successfully(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    """Positive control: proves uq_completions_entry_date is genuinely partial -
    standalone logs (schedule_entry_id NULL) never collide, no matter how many
    share a date.
    """
    user, _workout, _entry = _completion_parents
    first = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Standalone run 1",
        source=CompletionSource.STANDALONE,
    )
    second = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Standalone run 2",
        source=CompletionSource.STANDALONE,
    )
    session.add(first)
    session.add(second)
    await session.commit()

    assert first.id is not None
    assert second.id is not None


async def test_deleting_schedule_entry_nulls_link_and_keeps_completion(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Push Day",
        schedule_entry_id=entry.id,
        source=CompletionSource.SCHEDULED,
    )
    session.add(completion)
    await session.commit()

    await session.delete(entry)
    await session.commit()

    # expire_on_commit=False means the completion object above would otherwise
    # keep serving its stale pre-delete attributes from the identity map, even
    # under a fresh select() - refresh() forces a real round-trip to the row
    # ON DELETE SET NULL actually rewrote.
    await session.refresh(completion)
    assert completion.schedule_entry_id is None
    assert completion.label == "Push Day"
    # The one that matters: source is written once at creation and never
    # derived from schedule_entry_id, so it must survive the SET NULL intact -
    # this is the entire reason the column exists.
    assert completion.source == CompletionSource.SCHEDULED


async def test_deleting_workout_cascades_to_entry_but_keeps_completion(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    """The invariant that matters most: deleting a *plan or workout* must never
    delete a completion, even though the delete cascades workout -> schedule_entries
    first. A completion is a fact about the user, not a child of a plan.
    """
    user, workout, entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Leg Day",
        schedule_entry_id=entry.id,
        source=CompletionSource.SCHEDULED,
    )
    session.add(completion)
    await session.commit()
    completion_id = completion.id
    entry_id = entry.id

    await session.delete(workout)
    await session.commit()

    entry_result = await session.exec(select(ScheduleEntry).where(ScheduleEntry.id == entry_id))
    assert list(entry_result) == []

    # See test_deleting_schedule_entry_nulls_link_and_keeps_completion for why
    # refresh() (not a fresh select()) is required to observe the SET NULL.
    await session.refresh(completion)
    assert completion.id == completion_id
    assert completion.schedule_entry_id is None
    assert completion.label == "Leg Day"
    assert completion.source == CompletionSource.SCHEDULED


async def test_deleting_completion_leaves_its_entry_untouched(
    session: AsyncSession, _completion_parents: tuple[User, Workout, ScheduleEntry]
) -> None:
    user, _workout, entry = _completion_parents
    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Push Day",
        schedule_entry_id=entry.id,
        source=CompletionSource.SCHEDULED,
    )
    session.add(completion)
    await session.commit()
    entry_id = entry.id

    await session.delete(completion)
    await session.commit()

    result = await session.exec(select(ScheduleEntry).where(ScheduleEntry.id == entry_id))
    assert result.one().id == entry_id


async def test_deleting_user_cascades_to_completions(session: AsyncSession) -> None:
    user = User(id=uuid.uuid4(), email="completion-deleteme@example.com")
    session.add(user)
    await session.commit()

    completion = Completion(
        user_id=user.id,
        on_date=date(2026, 8, 10),
        label="Standalone run",
        source=CompletionSource.STANDALONE,
    )
    session.add(completion)
    await session.commit()
    completion_id = completion.id

    await session.delete(user)
    await session.commit()

    result = await session.exec(select(Completion).where(Completion.id == completion_id))
    assert list(result) == []


# Commitments


@pytest_asyncio.fixture
async def _commitment_creator(session: AsyncSession) -> User:
    user = User(id=uuid.uuid4(), email="commitments@example.com")
    session.add(user)
    await session.commit()
    return user


def _valid_goal_kwargs(creator_id: uuid.UUID) -> dict:
    """A minimal, fully-valid goal - every backstop test below mutates exactly
    one field away from this baseline to isolate the single CHECK it exercises.
    """
    return {
        "creator_id": creator_id,
        "activity": "running",
        "sessions_per_week": 3,
        "starts_on": date(2026, 8, 10),
    }


async def test_target_value_without_target_unit_violates_both_or_neither_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    commitment = Commitment(
        **_valid_goal_kwargs(_commitment_creator.id), target_value=Decimal("5"), target_unit=None
    )
    await _assert_violates(session, commitment, "ck_commitments_target_both_or_neither")


async def test_target_unit_without_target_value_violates_both_or_neither_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    commitment = Commitment(
        **_valid_goal_kwargs(_commitment_creator.id), target_value=None, target_unit="miles"
    )
    await _assert_violates(session, commitment, "ck_commitments_target_both_or_neither")


async def test_target_value_zero_violates_positive_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    commitment = Commitment(
        **_valid_goal_kwargs(_commitment_creator.id),
        target_value=Decimal("0"),
        target_unit="miles",
    )
    await _assert_violates(session, commitment, "ck_commitments_target_value_positive")


async def test_sessions_per_week_above_range_violates_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    kwargs = _valid_goal_kwargs(_commitment_creator.id)
    kwargs["sessions_per_week"] = 8
    commitment = Commitment(**kwargs)
    await _assert_violates(session, commitment, "ck_commitments_sessions_per_week_range")


async def test_sessions_per_week_below_range_violates_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    kwargs = _valid_goal_kwargs(_commitment_creator.id)
    kwargs["sessions_per_week"] = 0
    commitment = Commitment(**kwargs)
    await _assert_violates(session, commitment, "ck_commitments_sessions_per_week_range")


async def test_duration_weeks_above_range_violates_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    commitment = Commitment(**_valid_goal_kwargs(_commitment_creator.id), duration_weeks=9)
    await _assert_violates(session, commitment, "ck_commitments_duration_weeks_range")


async def test_duration_weeks_below_range_violates_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    commitment = Commitment(**_valid_goal_kwargs(_commitment_creator.id), duration_weeks=0)
    await _assert_violates(session, commitment, "ck_commitments_duration_weeks_range")


async def test_goal_with_no_starts_on_violates_goal_shape_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    kwargs = _valid_goal_kwargs(_commitment_creator.id)
    kwargs["starts_on"] = None
    commitment = Commitment(**kwargs)
    await _assert_violates(session, commitment, "ck_commitments_goal_shape")


async def test_goal_with_invite_status_violates_goal_shape_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    commitment = Commitment(
        **_valid_goal_kwargs(_commitment_creator.id), invite_status=InviteStatus.PENDING
    )
    await _assert_violates(session, commitment, "ck_commitments_goal_shape")


async def test_rematch_of_self_violates_check(
    session: AsyncSession, _commitment_creator: User
) -> None:
    commitment_id = uuid.uuid4()
    commitment = Commitment(
        id=commitment_id,
        **_valid_goal_kwargs(_commitment_creator.id),
        rematch_of_id=commitment_id,
    )
    await _assert_violates(session, commitment, "ck_commitments_rematch_not_self")
