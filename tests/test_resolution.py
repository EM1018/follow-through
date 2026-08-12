import uuid
from datetime import UTC, date, datetime

from app.models.schedule_entry import ScheduleEntry
from app.services.resolution import resolve

MON, TUE, WED, THU, FRI, SAT, SUN = range(1, 8)

W1 = uuid.uuid4()
W2 = uuid.uuid4()
W3 = uuid.uuid4()

_DEFAULT_CREATED_AT = datetime(2026, 1, 1, tzinfo=UTC)


def _recurring_entry(
    workout_id: uuid.UUID | None,
    day_of_week: int,
    *,
    name_override: str | None = None,
    replaces_entry_id: uuid.UUID | None = None,
    starts_on: date | None = None,
    ends_on: date | None = None,
    created_at: datetime = _DEFAULT_CREATED_AT,
) -> ScheduleEntry:
    return ScheduleEntry(
        plan_id=uuid.uuid4(),  # resolve() is plan-blind; any id will do
        workout_id=workout_id,
        day_of_week=day_of_week,
        name_override=name_override,
        replaces_entry_id=replaces_entry_id,
        starts_on=starts_on,
        ends_on=ends_on,
        created_at=created_at,
    )


def _dated_entry(
    workout_id: uuid.UUID | None,
    on_date: date,
    *,
    name_override: str | None = None,
    replaces_entry_id: uuid.UUID | None = None,
    # starts_on/ends_on are forbidden on dated entries over the API, but the
    # resolver must stay well-defined on any input, so the builder allows it.
    starts_on: date | None = None,
    ends_on: date | None = None,
    created_at: datetime = _DEFAULT_CREATED_AT,
) -> ScheduleEntry:
    return ScheduleEntry(
        plan_id=uuid.uuid4(),
        workout_id=workout_id,
        day_of_week=None,
        on_date=on_date,
        name_override=name_override,
        replaces_entry_id=replaces_entry_id,
        starts_on=starts_on,
        ends_on=ends_on,
        created_at=created_at,
    )


def _cancellation(
    on_date: date, replaces_entry_id: uuid.UUID, *, created_at: datetime = _DEFAULT_CREATED_AT
) -> ScheduleEntry:
    """A dated entry with nothing of its own to show: suppresses its target
    and never appears itself, on any date.
    """
    return _dated_entry(None, on_date, replaces_entry_id=replaces_entry_id, created_at=created_at)


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


def test_recurring_and_dated_entries_are_additive_by_default() -> None:
    """Superseded by Stage B: a dated entry with no replaces_entry_id is
    additive, not a silent override - it was ignored entirely in Stage A,
    where resolve() didn't understand on_date at all. See scenario 18/19 for
    the additive-vs-replacing distinction.
    """
    recurring = _recurring_entry(W1, MON)
    dated = _dated_entry(W2, date(2026, 8, 10))

    result = resolve([recurring, dated], date(2026, 8, 10))

    assert result == [recurring, dated]


# STAGE B SCENARIOS


def test_dated_entry_matches_its_exact_date() -> None:
    """Scenario 16."""
    entry = _dated_entry(W2, date(2026, 8, 10))
    assert resolve([entry], date(2026, 8, 10)) == [entry]


def test_dated_entry_does_not_match_other_dates() -> None:
    """Scenario 17."""
    entry = _dated_entry(W2, date(2026, 8, 10))
    assert resolve([entry], date(2026, 8, 11)) == []


def test_dated_entry_without_replaces_is_additive() -> None:
    """Scenario 18. PAIR with scenario 19 - additive by default, replaces_entry_id
    is what makes it a replacement instead.
    """
    t1 = datetime(2026, 1, 1, tzinfo=UTC)
    t2 = datetime(2026, 1, 2, tzinfo=UTC)
    recurring = _recurring_entry(W1, MON, created_at=t1)
    dated = _dated_entry(W2, date(2026, 8, 10), created_at=t2)

    result = resolve([recurring, dated], date(2026, 8, 10))

    assert result == [recurring, dated]


def test_replacement_suppresses_target_on_its_date() -> None:
    """Scenario 19. PAIR with scenario 20."""
    recurring = _recurring_entry(W1, MON)
    replacement = _dated_entry(W2, date(2026, 8, 10), replaces_entry_id=recurring.id)

    assert resolve([recurring, replacement], date(2026, 8, 10)) == [replacement]


def test_replacement_is_scoped_to_its_own_date() -> None:
    """Scenario 20. PAIR with scenario 19 - same pair of entries, a different
    Monday: the target reappears unsuppressed.
    """
    recurring = _recurring_entry(W1, MON)
    replacement = _dated_entry(W2, date(2026, 8, 10), replaces_entry_id=recurring.id)

    assert resolve([recurring, replacement], date(2026, 8, 17)) == [recurring]


def test_cancellation_suppresses_target_and_shows_nothing() -> None:
    """Scenario 21. PAIR with scenario 22."""
    recurring = _recurring_entry(W1, MON)
    cancellation = _cancellation(date(2026, 8, 10), recurring.id)

    assert resolve([recurring, cancellation], date(2026, 8, 10)) == []


def test_cancellation_is_scoped_to_its_own_date() -> None:
    """Scenario 22. PAIR with scenario 21."""
    recurring = _recurring_entry(W1, MON)
    cancellation = _cancellation(date(2026, 8, 10), recurring.id)

    assert resolve([recurring, cancellation], date(2026, 8, 17)) == [recurring]


def test_replacement_shows_even_if_target_never_matched_that_date() -> None:
    """Scenario 23. PAIR with scenario 24. The target is a Monday-only entry;
    the replacement dates a Tuesday the target would never have matched.
    """
    recurring = _recurring_entry(W1, MON)
    replacement = _dated_entry(W2, date(2026, 8, 11), replaces_entry_id=recurring.id)

    assert resolve([recurring, replacement], date(2026, 8, 11)) == [replacement]


def test_replacement_on_a_non_matching_date_leaves_targets_own_date_alone() -> None:
    """Scenario 24. PAIR with scenario 23."""
    recurring = _recurring_entry(W1, MON)
    replacement = _dated_entry(W2, date(2026, 8, 11), replaces_entry_id=recurring.id)

    assert resolve([recurring, replacement], date(2026, 8, 10)) == [recurring]


def test_chained_replacement_only_the_last_link_survives() -> None:
    """Scenario 25. Falls out of the suppress-from-matched set logic for free:
    d1 is itself in `matched` and contributes recurring.id to the suppressed
    set, while d2 contributes d1.id.
    """
    recurring = _recurring_entry(W1, MON)
    d1 = _dated_entry(W2, date(2026, 8, 10), replaces_entry_id=recurring.id)
    d2 = _dated_entry(W3, date(2026, 8, 10), replaces_entry_id=d1.id)

    assert resolve([recurring, d1, d2], date(2026, 8, 10)) == [d2]


def test_replacement_with_dangling_target_still_shows() -> None:
    """Scenario 26."""
    replacement = _dated_entry(W2, date(2026, 8, 10), replaces_entry_id=uuid.uuid4())
    assert resolve([replacement], date(2026, 8, 10)) == [replacement]


def test_name_only_dated_entry_matches_its_date() -> None:
    """Scenario 27."""
    entry = _dated_entry(None, date(2026, 8, 10), name_override="Recovery walk")
    assert resolve([entry], date(2026, 8, 10)) == [entry]


def test_name_only_recurring_entry_matches_its_weekday() -> None:
    """Scenario 28."""
    entry = _recurring_entry(None, SUN, name_override="Rest")
    assert resolve([entry], date(2026, 8, 16)) == [entry]


def test_ordering_interleaves_recurring_and_dated_by_created_at() -> None:
    """Scenario 29. Kind-blind ordering: no dated-first or recurring-first rule."""
    t1 = datetime(2026, 1, 1, tzinfo=UTC)
    t2 = datetime(2026, 1, 2, tzinfo=UTC)
    t3 = datetime(2026, 1, 3, tzinfo=UTC)
    e1 = _recurring_entry(W1, MON, created_at=t1)
    d = _dated_entry(W2, date(2026, 8, 10), created_at=t2)
    e2 = _recurring_entry(W3, MON, created_at=t3)

    # fed out of order - a resolve() that merely preserved input order would fail this
    result = resolve([e2, d, e1], date(2026, 8, 10))

    assert result == [e1, d, e2]


def test_dated_entry_ignores_starts_on_and_ends_on() -> None:
    """Scenario 30. Unreachable via the API (which forbids the combination),
    but the resolver must be well-defined on any input.
    """
    entry = _dated_entry(
        W1, date(2026, 8, 10), starts_on=date(2026, 8, 20), ends_on=date(2026, 8, 25)
    )
    assert resolve([entry], date(2026, 8, 10)) == [entry]


def test_cancellation_never_appears_even_when_its_target_does_not_match() -> None:
    """Scenario 31. The target is Monday-only; the cancellation dates a Tuesday
    it would never have matched, so it suppresses nothing - it still never
    shows itself.
    """
    recurring = _recurring_entry(W1, MON)
    cancellation = _cancellation(date(2026, 8, 11), recurring.id)

    assert resolve([recurring, cancellation], date(2026, 8, 11)) == []


def test_two_replacements_of_the_same_target_both_show() -> None:
    """Scenario 32."""
    t1 = datetime(2026, 1, 1, tzinfo=UTC)
    t2 = datetime(2026, 1, 2, tzinfo=UTC)
    recurring = _recurring_entry(W1, MON)
    d1 = _dated_entry(W2, date(2026, 8, 10), replaces_entry_id=recurring.id, created_at=t1)
    d2 = _dated_entry(W3, date(2026, 8, 10), replaces_entry_id=recurring.id, created_at=t2)

    result = resolve([recurring, d2, d1], date(2026, 8, 10))

    assert result == [d1, d2]


def test_suppression_is_by_id_not_by_day() -> None:
    """Scenario 33. e2 is a distinct Monday entry, unrelated to the cancellation -
    suppression must key off replaces_entry_id -> id, not "some entry today got cancelled".
    """
    e1 = _recurring_entry(W1, MON)
    cancellation = _cancellation(date(2026, 8, 10), e1.id)
    e2 = _recurring_entry(W2, MON)

    assert resolve([e1, cancellation, e2], date(2026, 8, 10)) == [e2]
