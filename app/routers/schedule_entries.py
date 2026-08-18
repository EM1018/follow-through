import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import get_owned_plan
from app.models.completion import Completion
from app.models.plan import Plan
from app.models.schedule_entry import ScheduleEntry
from app.models.workout import Workout
from app.schemas.schedule_entry import ScheduleEntryCreate, ScheduleEntryRead, ScheduleEntryUpdate
from app.services.resolution import date_within_plan_window

router = APIRouter(prefix="/plans/{plan_id}/schedule-entries", tags=["schedule-entries"])


async def _reject_if_completion_exists(
    session: AsyncSession, schedule_entry_id: uuid.UUID, on_date: date
) -> None:
    """"This happened" and "this didn't happen" can't both be true for the
    same entry on the same day - scoped to the date, not the entry, since a
    recurring entry is one row covering many Mondays and a completion on one
    must not block cancelling another.
    """
    conflict = await session.exec(
        select(Completion).where(
            Completion.schedule_entry_id == schedule_entry_id, Completion.on_date == on_date
        )
    )
    if conflict.first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A completion already exists for this entry on this date",
        )


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


async def _get_plan_entry(
    session: AsyncSession, plan_id: uuid.UUID, entry_id: uuid.UUID
) -> ScheduleEntry:
    """replaces_entry_id is a body field, not a path param - same reasoning as
    _get_plan_workout: an entry from a different plan is treated identically
    to one that doesn't exist.
    """
    entry = await session.get(ScheduleEntry, entry_id)
    if entry is None or entry.plan_id != plan_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found"
        )
    return entry


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
    if body.workout_id is not None:
        await _get_plan_workout(session, plan.id, body.workout_id)
    if body.replaces_entry_id is not None:
        await _get_plan_entry(session, plan.id, body.replaces_entry_id)
        # replaces_entry_id is never set without on_date (the create schema's
        # own XOR validator guarantees it), so this is always reachable here.
        if body.on_date is not None:
            await _reject_if_completion_exists(session, body.replaces_entry_id, body.on_date)

    for field in ("starts_on", "ends_on", "on_date"):
        value = getattr(body, field)
        if value is not None and not date_within_plan_window(value, plan.starts_on, plan.ends_on):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"{field} must fall within the plan's own window",
            )

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
    entry_is_dated = entry.on_date is not None

    # A PATCH may not change an entry's kind - delete and recreate to convert.
    # These are checked against the entry's *current* kind, so e.g. day_of_week
    # on an already-recurring entry (just changing the weekday) is unaffected.
    if "day_of_week" in updates and entry_is_dated:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="day_of_week cannot be set on a dated entry",
        )
    if "on_date" in updates and not entry_is_dated:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="on_date cannot be set on a recurring entry",
        )
    if ("starts_on" in updates or "ends_on" in updates) and entry_is_dated:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="starts_on/ends_on cannot be set on a dated entry",
        )
    if "replaces_entry_id" in updates and not entry_is_dated:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="replaces_entry_id cannot be set on a recurring entry",
        )
    if updates.get("replaces_entry_id") == entry.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="an entry cannot replace itself",
        )

    if updates.get("workout_id") is not None:
        await _get_plan_workout(session, plan.id, updates["workout_id"])
    if updates.get("replaces_entry_id") is not None:
        await _get_plan_entry(session, plan.id, updates["replaces_entry_id"])

    # validate against the *effective* result of this patch, since a partial
    # update might only send one of several related fields
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

    effective_on_date = updates.get("on_date", entry.on_date)
    for field, effective_value in (
        ("starts_on", effective_starts_on),
        ("ends_on", effective_ends_on),
        ("on_date", effective_on_date),
    ):
        if effective_value is not None and not date_within_plan_window(
            effective_value, plan.starts_on, plan.ends_on
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"{field} must fall within the plan's own window",
            )

    effective_workout_id = updates.get("workout_id", entry.workout_id)
    effective_name_override = updates.get("name_override", entry.name_override)
    effective_replaces_entry_id = updates.get("replaces_entry_id", entry.replaces_entry_id)
    if effective_replaces_entry_id is not None and effective_on_date is not None:
        await _reject_if_completion_exists(session, effective_replaces_entry_id, effective_on_date)
    if (
        effective_workout_id is None
        and effective_name_override is None
        and effective_replaces_entry_id is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="at least one of workout_id, name_override, or replaces_entry_id is required",
        )
    if effective_workout_id is not None and effective_name_override is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="name_override cannot be set together with workout_id",
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
