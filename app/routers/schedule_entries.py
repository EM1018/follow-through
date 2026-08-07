import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import get_owned_plan
from app.models.plan import Plan
from app.models.schedule_entry import ScheduleEntry
from app.models.workout import Workout
from app.schemas.schedule_entry import ScheduleEntryCreate, ScheduleEntryRead, ScheduleEntryUpdate

router = APIRouter(prefix="/plans/{plan_id}/schedule-entries", tags=["schedule-entries"])


async def _get_plan_workout(
    session: AsyncSession, plan_id: uuid.UUID, workout_id: uuid.UUID
) -> Workout:
    """workout_id is a body field, not a path param, so this can't be a Depends()
    the way _get_owned_entry is - it's called directly wherever workout_id shows up
    in a request body. Same 404-for-wrong-scope reasoning as workouts._get_owned_workout:
    a workout from a different plan is treated identically to one that doesn't exist.
    """
    workout = await session.get(Workout, workout_id)
    if workout is None or workout.plan_id != plan_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return workout


async def _get_owned_entry(
    entry_id: uuid.UUID,
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> ScheduleEntry:
    entry = await session.get(ScheduleEntry, entry_id)
    if entry is None or entry.plan_id != plan.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found"
        )
    return entry


@router.post("", response_model=ScheduleEntryRead, status_code=status.HTTP_201_CREATED)
async def create_entry(
    body: ScheduleEntryCreate,
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> ScheduleEntry:
    await _get_plan_workout(session, plan.id, body.workout_id)

    entry = ScheduleEntry(plan_id=plan.id, **body.model_dump())
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.get("", response_model=list[ScheduleEntryRead])
async def list_entries(
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> list[ScheduleEntry]:
    result = await session.exec(
        select(ScheduleEntry)
        .where(ScheduleEntry.plan_id == plan.id)
        .order_by(ScheduleEntry.created_at.asc())
    )
    return list(result)


@router.patch("/{entry_id}", response_model=ScheduleEntryRead)
async def update_entry(
    body: ScheduleEntryUpdate,
    entry: ScheduleEntry = Depends(_get_owned_entry),
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> ScheduleEntry:
    updates = body.model_dump(exclude_unset=True)

    if updates.get("workout_id") is not None:
        await _get_plan_workout(session, plan.id, updates["workout_id"])

    # validate against the *effective* result of this patch, since a partial
    # update might only send one of starts_on/ends_on
    effective_starts_on = updates.get("starts_on", entry.starts_on)
    effective_ends_on = updates.get("ends_on", entry.ends_on)
    if (
        effective_ends_on is not None
        and effective_starts_on is not None
        and effective_ends_on < effective_starts_on
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="ends_on must be on or after starts_on",
        )

    for field, value in updates.items():
        setattr(entry, field, value)

    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry: ScheduleEntry = Depends(_get_owned_entry),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(entry)
    await session.commit()
