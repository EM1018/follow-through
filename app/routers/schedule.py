from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import get_owned_plan
from app.models.plan import Plan
from app.models.schedule_entry import ScheduleEntry
from app.models.workout import Workout
from app.services.resolution import resolve

router = APIRouter(prefix="/plans/{plan_id}/schedule", tags=["schedule"])

_MAX_WINDOW_DAYS = 92 # longest-possible three consecutive months


@router.get("")
async def get_schedule(
    from_: date = Query(alias="from"),
    to: date = Query(),
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, list[dict[str, str | None]]]]:
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

    entries_result = await session.exec(
        select(ScheduleEntry).where(ScheduleEntry.plan_id == plan.id)
    )
    entries = list(entries_result)

    workouts_result = await session.exec(select(Workout).where(Workout.plan_id == plan.id))
    workouts_by_id = {workout.id: workout for workout in workouts_result}

    days: dict[str, list[dict[str, str | None]]] = {}
    current = from_
    while current <= to:
        day_entries = []
        for entry in resolve(entries, current):
            workout = workouts_by_id.get(entry.workout_id)
            day_entries.append(
                {
                    "entry_id": str(entry.id),
                    "workout_id": str(entry.workout_id),
                    "name": workout.name if workout else None,
                    "notes": workout.notes if workout else None,
                }
            )
        days[current.isoformat()] = day_entries
        current += timedelta(days=1)

    return {"days": days}
