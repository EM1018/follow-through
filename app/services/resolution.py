from collections.abc import Sequence
from datetime import date

from app.models.schedule_entry import ScheduleEntry


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


def resolve(entries: Sequence[ScheduleEntry], on: date) -> list[ScheduleEntry]:
    """Stage A+B schedule resolution: which entries apply on a given date.

    Pure and plan-blind - takes no plan, session, or app state, so it can never
    consult (or be broken by) a plan's is_active flag or its own starts_on/ends_on.
    """
    matched = [entry for entry in entries if _matches(entry, on)]

    # Suppression is built from what matched TODAY, not from every entry ever
    # passed in - a replacement/cancellation only takes out its target on its
    # own date. Building this set from `entries` instead of `matched` would
    # make a single dated replacement suppress its recurring target forever.
    suppressed_ids = {
        entry.replaces_entry_id for entry in matched if entry.replaces_entry_id is not None
    }

    survivors = [
        entry for entry in matched if entry.id not in suppressed_ids and not _is_cancellation(entry)
    ]
    return sorted(survivors, key=lambda entry: entry.created_at)
