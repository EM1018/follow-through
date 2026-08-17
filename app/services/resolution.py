from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from enum import StrEnum

from app.models.schedule_entry import ScheduleEntry


class EntryStatus(StrEnum):
    SCHEDULED = "scheduled"
    SUBSTITUTED = "substituted"


class DayStatus(StrEnum):
    """Day-level status is a presentation convenience for compact rendering
    (e.g. a single calendar-cell badge) - `entries` and `cancelled` are the
    authoritative data. Clients must not branch on this status alone in a
    detailed view: a SCHEDULED day can still carry unrelated cancelled
    entries (see resolve()'s mixed-day precedence), and SUBSTITUTED only
    means *at least one* surviving entry that day is a substitution.

    These string values are part of the public wire contract - app/schemas/
    imports this enum directly for the API response, so renaming a member
    here changes the API, not just an internal detail.
    """

    EMPTY = "empty"
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"
    SUBSTITUTED = "substituted"


@dataclass
class ResolvedEntry:
    """A surviving entry for a given day, with its own classification.

    replaced is the entry this one replaces, looked up from the same
    `entries` sequence passed to resolve() - not a fresh DB lookup, since
    resolve() stays session-free. It is None whenever status is SCHEDULED,
    and also None for a SUBSTITUTED entry whose target isn't present in the
    given entries (unreachable via the real API today, since the composite
    FK on replaces_entry_id is ON DELETE CASCADE - a live row can never
    point at a target that no longer exists - but resolve() stays a pure
    function that must be well-defined on any input, including a
    hand-constructed one in a unit test).
    """

    entry: ScheduleEntry
    status: EntryStatus
    replaced: ScheduleEntry | None = None


@dataclass
class DayResolution:
    status: DayStatus
    entries: list[ResolvedEntry]
    cancelled: list[ScheduleEntry]


def _matches(entry: ScheduleEntry, on: date) -> bool:
    if entry.on_date is not None:
        # Dated entries are exact - starts_on/ends_on are meaningless on a
        # one-off and the API forbids setting them, but stay well-defined here
        # regardless of what the caller hands in.
        return entry.on_date == on
    return (
        entry.day_of_week == on.isoweekday()
        and (entry.starts_on is None or entry.starts_on <= on)
        and (entry.ends_on is None or on <= entry.ends_on)
    )


def _is_cancellation(entry: ScheduleEntry) -> bool:
    return (
        entry.replaces_entry_id is not None
        and entry.workout_id is None
        and entry.name_override is None
    )


def resolve(entries: Sequence[ScheduleEntry], on: date) -> DayResolution:
    """Stage A+B+C schedule resolution: which entries apply on a given date,
    and what became of anything they suppressed.

    Pure and plan-blind - takes no plan, session, or app state, so it can never
    consult (or be broken by) a plan's is_active flag or its own starts_on/ends_on.
    """
    matched = [entry for entry in entries if _matches(entry, on)]
    by_id = {entry.id: entry for entry in entries}

    # Suppression is built from what matched TODAY, not from every entry ever
    # passed in - a replacement/cancellation only takes out its target on its
    # own date. Building this set from `entries` instead of `matched` would
    # make a single dated replacement suppress its recurring target forever.
    suppressed_ids = {
        entry.replaces_entry_id for entry in matched if entry.replaces_entry_id is not None
    }

    survivors = sorted(
        (
            entry
            for entry in matched
            if entry.id not in suppressed_ids and not _is_cancellation(entry)
        ),
        key=lambda entry: entry.created_at,
    )

    resolved_entries = [
        ResolvedEntry(
            entry=entry,
            status=(
                EntryStatus.SUBSTITUTED
                if entry.replaces_entry_id is not None
                else EntryStatus.SCHEDULED
            ),
            replaced=(
                by_id.get(entry.replaces_entry_id) if entry.replaces_entry_id is not None else None
            ),
        )
        for entry in survivors
    ]

    # Deliberately keyed off `matched`, not `by_id`: a cancellation is only
    # worth reporting if its target would actually have shown up today. A
    # replacement's `replaced` reference above uses the full `by_id` on
    # purpose (it shows regardless of whether its target matched today - see
    # scenario 23/24), but a cancellation contributes nothing of its own, so
    # "cancelled today" must mean the target was actually suppressed today,
    # not just that some cancellation-shaped row happens to reference it.
    matched_by_id = {entry.id: entry for entry in matched}
    cancelled = [
        matched_by_id[entry.replaces_entry_id]
        for entry in matched
        if _is_cancellation(entry) and entry.replaces_entry_id in matched_by_id
    ]

    if any(resolved.status is EntryStatus.SUBSTITUTED for resolved in resolved_entries):
        day_status = DayStatus.SUBSTITUTED
    elif resolved_entries:
        day_status = DayStatus.SCHEDULED
    elif cancelled:
        day_status = DayStatus.CANCELLED
    else:
        day_status = DayStatus.EMPTY

    return DayResolution(status=day_status, entries=resolved_entries, cancelled=cancelled)


def date_within_plan_window(on: date, plan_starts_on: date, plan_ends_on: date | None) -> bool:
    """Whether `on` falls inside [plan_starts_on, plan_ends_on], both bounds
    inclusive. plan_ends_on is nullable - a plan with no end date has no
    upper bound.

    Deliberately outside resolve(): resolve() is plan-blind by design (see its
    own docstring) and must stay that way, so this lives one layer up as a
    separate, equally pure primitive. It answers the same question in two
    places: the schedule endpoint clamps out-of-window dates to EMPTY before
    ever calling resolve() (resolve() itself never sees the plan or learns
    that a date is out of range), and schedule-entry create/update reuse it
    to reject starts_on/ends_on/on_date values that fall outside the plan -
    "is this date within the plan" is the same check either way.
    """
    return plan_starts_on <= on and (plan_ends_on is None or on <= plan_ends_on)
