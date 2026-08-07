import uuid
from datetime import UTC, date, datetime

from app.models.schedule_entry import ScheduleEntry
from app.services.resolution import resolve

MON, TUE, WED, THU, FRI, SAT, SUN = range(1, 8)

W1 = uuid.uuid4()
W2 = uuid.uuid4()

_DEFAULT_CREATED_AT = datetime(2026, 1, 1, tzinfo=UTC)


def _recurring_entry(
    workout_id: uuid.UUID,
    day_of_week: int,
    *,
    starts_on: date | None = None,
    ends_on: date | None = None,
    created_at: datetime = _DEFAULT_CREATED_AT,
) -> ScheduleEntry:
    return ScheduleEntry(
        plan_id=uuid.uuid4(),  # resolve() is plan-blind; any id will do
        workout_id=workout_id,
        day_of_week=day_of_week,
        starts_on=starts_on,
        ends_on=ends_on,
        created_at=created_at,
    )


def _dated_entry(
    workout_id: uuid.UUID, on_date: date, *, created_at: datetime = _DEFAULT_CREATED_AT
) -> ScheduleEntry:
    return ScheduleEntry(
        plan_id=uuid.uuid4(),
        workout_id=workout_id,
        day_of_week=None,
        on_date=on_date,
        created_at=created_at,
    )

# UNIT TESTS

def test_matching_day_returns_entry() -> None:
    entry = _recurring_entry(W1, MON)
    assert resolve([entry], date(2026, 8, 10)) == [entry]


def test_non_matching_day_returns_empty() -> None:
    entry = _recurring_entry(W1, MON)
    assert resolve([entry], date(2026, 8, 11)) == []


def test_only_matching_day_entry_returned_among_several() -> None:
    mon_entry = _recurring_entry(W1, MON)
    fri_entry = _recurring_entry(W1, FRI)
    wed_entry = _recurring_entry(W2, WED)

    result = resolve([mon_entry, fri_entry, wed_entry], date(2026, 8, 12))

    assert result == [wed_entry]


def test_before_starts_on_does_not_match() -> None:
    entry = _recurring_entry(W1, MON, starts_on=date(2026, 8, 17))
    assert resolve([entry], date(2026, 8, 10)) == []


def test_on_starts_on_matches_inclusive() -> None:
    entry = _recurring_entry(W1, MON, starts_on=date(2026, 8, 17))
    assert resolve([entry], date(2026, 8, 17)) == [entry]


def test_after_ends_on_does_not_match() -> None:
    entry = _recurring_entry(W1, MON, ends_on=date(2026, 8, 17))
    assert resolve([entry], date(2026, 8, 24)) == []


def test_on_ends_on_matches_inclusive() -> None:
    """The boundary pair with test_after_ends_on_does_not_match: ends_on itself
    still matches, only the day after it doesn't.
    """
    entry = _recurring_entry(W1, MON, ends_on=date(2026, 8, 17))
    assert resolve([entry], date(2026, 8, 17)) == [entry]


def test_multiple_matches_ordered_by_created_at() -> None:
    t1 = datetime(2026, 1, 1, tzinfo=UTC)
    t2 = datetime(2026, 1, 2, tzinfo=UTC)
    e1 = _recurring_entry(W1, MON, created_at=t1)
    e2 = _recurring_entry(W2, MON, created_at=t2)

    # fed in reverse of creation order - a resolve() that merely preserved input
    # order (instead of actually sorting by created_at) would fail this
    result = resolve([e2, e1], date(2026, 8, 10))

    assert result == [e1, e2]


def test_open_ended_entry_matches_far_future_date() -> None:
    entry = _recurring_entry(W1, MON)
    assert resolve([entry], date(2027, 8, 9)) == [entry]


def test_sunday_does_not_match_monday_entry() -> None:
    entry = _recurring_entry(W1, MON)
    assert resolve([entry], date(2026, 8, 16)) == []


def test_no_entries_returns_empty() -> None:
    assert resolve([], date(2026, 8, 10)) == []


def test_one_entry_per_weekday_only_thursday_matches() -> None:
    entries = [_recurring_entry(W1, day) for day in range(1, 8)]

    result = resolve(entries, date(2026, 8, 13))

    assert len(result) == 1
    assert result[0].day_of_week == THU


def test_entry_bounds_govern_regardless_of_any_plan() -> None:
    entry = _recurring_entry(W1, MON, starts_on=date(2026, 8, 3), ends_on=date(2026, 8, 31))
    assert resolve([entry], date(2026, 8, 31)) == [entry]


def test_entry_past_its_end_date_is_dormant() -> None:
    entry = _recurring_entry(W1, MON, ends_on=date(2026, 7, 31))
    assert resolve([entry], date(2026, 8, 10)) == []


def test_dated_entries_are_ignored_in_stage_a() -> None:
    recurring = _recurring_entry(W1, MON)
    dated = _dated_entry(W2, date(2026, 8, 10))

    result = resolve([recurring, dated], date(2026, 8, 10))

    assert result == [recurring]
