from collections.abc import Sequence
from datetime import date

from app.models.schedule_entry import ScheduleEntry


def resolve(entries: Sequence[ScheduleEntry], on: date) -> list[ScheduleEntry]:
    """Stage A schedule resolution: which recurring entries apply on a given date.

    Pure and plan-blind - takes no plan, session, or app state, so it can never
    consult (or be broken by) a plan's is_active flag or its own starts_on/ends_on.
    Dated entries (on_date set) are Stage B and are ignored here.
    """
    matches = [
        entry
        for entry in entries
        if entry.on_date is None
        and entry.day_of_week == on.isoweekday()
        and (entry.starts_on is None or entry.starts_on <= on)
        and (entry.ends_on is None or on <= entry.ends_on)
    ]
    return sorted(matches, key=lambda entry: entry.created_at)
