from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import get_owned_plan
from app.models.completion import Completion
from app.models.plan import Plan
from app.models.schedule_entry import ScheduleEntry
from app.models.workout import Workout
from app.schemas.schedule import ScheduleResponse
from app.services.resolution import DayResolution, DayStatus, date_within_plan_window, resolve

router = APIRouter(prefix="/plans/{plan_id}/schedule", tags=["schedule"])

_MAX_WINDOW_DAYS = 92  # longest possible three consecutive months (31 + 30 + 31)


def _display(entry: ScheduleEntry, workouts_by_id: dict) -> tuple[str | None, str | None]:
    if entry.workout_id is not None:
        workout = workouts_by_id.get(entry.workout_id)
        return (workout.name if workout else None, workout.notes if workout else None)
    # name-only entry - no fallback chain needed, since name_override and
    # workout_id are mutually exclusive here.
    return (entry.name_override, None)


@router.get("", response_model=ScheduleResponse)
async def get_schedule(
    from_: date = Query(alias="from"),
    to: date = Query(),
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if from_ > to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="from must be <= to"
        )

    window_days = (to - from_).days + 1
    if window_days > _MAX_WINDOW_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"window must be at most {_MAX_WINDOW_DAYS} days",
        )

    # All three queries are plan-scoped (or, for completions, further date-
    # windowed), not per-day - one round trip each, regardless of range size.
    # replaces_entry_id's composite FK guarantees anything a day's resolution
    # could reference (a survivor, a replaced entry, or a cancelled target)
    # belongs to this same plan, so all three result sets already cover
    # everything the loop below could possibly need - there is no per-day or
    # per-entry follow-up query.
    entries_result = await session.exec(
        select(ScheduleEntry).where(ScheduleEntry.plan_id == plan.id)
    )
    entries = list(entries_result)

    workouts_result = await session.exec(select(Workout).where(Workout.plan_id == plan.id))
    workouts_by_id = {workout.id: workout for workout in workouts_result}

    # plan.user_id, not a fresh get_current_user() lookup - get_owned_plan
    # already confirmed this plan (and therefore every entry_id below) belongs
    # to the caller, so this is the same identity, not an extra one.
    entry_ids = [entry.id for entry in entries]
    completions_result = await session.exec(
        select(Completion).where(
            Completion.user_id == plan.user_id,
            Completion.on_date >= from_,
            Completion.on_date <= to,
            Completion.schedule_entry_id.in_(entry_ids),
        )
    )
    completions_by_date: dict[date, list[Completion]] = defaultdict(list)
    for completion in completions_result:
        completions_by_date[completion.on_date].append(completion)

    def _entry_ref(entry: ScheduleEntry) -> dict:
        name, _notes = _display(entry, workouts_by_id)
        return {"entry_id": str(entry.id), "name": name}

    days: dict[str, dict] = {}
    current = from_
    while current <= to:
        # Dates outside the plan's own window resolve to empty regardless of
        # what any entry says - resolve() never sees the plan and never learns
        # a date was out of range, it just isn't asked about those dates.
        if date_within_plan_window(current, plan.starts_on, plan.ends_on):
            day = resolve(entries, current, completions_by_date.get(current, []))
        else:
            day = DayResolution(status=DayStatus.EMPTY, entries=[], cancelled=[], completed=False)

        entries_read = []
        for resolved in day.entries:
            name, notes = _display(resolved.entry, workouts_by_id)
            entries_read.append(
                {
                    "entry_id": str(resolved.entry.id),
                    "workout_id": (
                        str(resolved.entry.workout_id)
                        if resolved.entry.workout_id is not None
                        else None
                    ),
                    "name": name,
                    "notes": notes,
                    "status": resolved.status,
                    "replaced": _entry_ref(resolved.replaced)
                    if resolved.replaced is not None
                    else None,
                    "completion_id": (
                        str(resolved.completion_id) if resolved.completion_id is not None else None
                    ),
                }
            )

        days[current.isoformat()] = {
            "status": day.status,
            "entries": entries_read,
            "cancelled": [_entry_ref(target) for target in day.cancelled],
            "completed": day.completed,
        }
        current += timedelta(days=1)

    return {"days": days}
