import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models.completion import Completion, CompletionSource
from app.models.plan import Plan
from app.models.schedule_entry import ScheduleEntry
from app.models.workout import Workout
from app.schemas.completion import CompletionCreate, CompletionRead, CompletionUpdate
from app.services.activities import ACTIVITY_UNITS, DISPLAY_NAMES, Activity

router = APIRouter(prefix="/completions", tags=["completions"])

_MAX_WINDOW_DAYS = 92  # matches GET /plans/{plan_id}/schedule


async def _get_owned_entry(
    session: AsyncSession, entry_id: uuid.UUID, user_id: uuid.UUID
) -> ScheduleEntry:
    """schedule_entry_id is a body field, not a path param - same reasoning as
    schedule_entries._get_plan_workout: an entry belonging to another user's
    plan is treated identically to one that doesn't exist at all.
    """
    entry = await session.get(ScheduleEntry, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found"
        )

    plan = await session.get(Plan, entry.plan_id)
    if plan is None or plan.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule entry not found"
        )

    return entry


def _derive_label(
    entry: ScheduleEntry | None, workout: Workout | None, activity: Activity | None
) -> str:
    if entry is None:
        # CompletionCreate guarantees activity is set whenever schedule_entry_id isn't.
        assert activity is not None
        return DISPLAY_NAMES[activity]

    if entry.name_override is not None:
        return entry.name_override
    if workout is not None:
        return workout.name
    # Stage B guarantees an entry has a name_override or a workout_id whenever
    # it isn't a pure cancellation - a cancellation-only entry has neither, so
    # this branch shouldn't be reachable via a real occurrence, but must not crash.
    if activity is not None:
        return DISPLAY_NAMES[activity]
    return "Workout"


@router.post("", response_model=CompletionRead, status_code=status.HTTP_201_CREATED)
async def create_completion(
    body: CompletionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Completion:
    entry: ScheduleEntry | None = None
    workout: Workout | None = None
    if body.schedule_entry_id is not None:
        entry = await _get_owned_entry(session, body.schedule_entry_id, current_user.user_id)
        if entry.workout_id is not None:
            workout = await session.get(Workout, entry.workout_id)

        # "This happened" and "this didn't happen" can't both be true for the
        # same entry on the same day - a cancellation or replacement (either
        # one suppresses the target the same way) already covers this date.
        cancellation = await session.exec(
            select(ScheduleEntry).where(
                ScheduleEntry.replaces_entry_id == body.schedule_entry_id,
                ScheduleEntry.on_date == body.on_date,
            )
        )
        if cancellation.first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This entry was cancelled or replaced on this date",
            )

    completion = Completion(
        user_id=current_user.user_id,
        activity=body.activity.value if body.activity is not None else None,
        value=body.value,
        unit=body.unit.value if body.unit is not None else None,
        on_date=body.on_date,
        schedule_entry_id=body.schedule_entry_id,
        source=(
            CompletionSource.SCHEDULED
            if body.schedule_entry_id is not None
            else CompletionSource.STANDALONE
        ).value,
        label=_derive_label(entry, workout, body.activity),
        note=body.note,
    )
    session.add(completion)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A completion already exists for this schedule entry on this date",
        ) from exc

    await session.refresh(completion)
    return completion


@router.get("", response_model=list[CompletionRead])
async def list_completions(
    from_: date = Query(alias="from"),
    to: date = Query(),
    activity: Activity | None = Query(default=None),
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Completion]:
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

    query = select(Completion).where(
        Completion.user_id == current_user.user_id,
        Completion.on_date >= from_,
        Completion.on_date <= to,
    )
    if activity is not None:
        # NULL activity rows never match an exact filter - there's no
        # sentinel for "unmatched" yet, and none is needed here.
        query = query.where(Completion.activity == activity.value)

    query = query.order_by(Completion.on_date.desc(), Completion.created_at.desc())

    result = await session.exec(query)
    return list(result)


async def _get_owned_completion(
    completion_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Completion:
    completion = await session.get(Completion, completion_id)
    if completion is None or completion.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Completion not found")
    return completion


@router.patch("/{completion_id}", response_model=CompletionRead)
async def update_completion(
    body: CompletionUpdate,
    completion: Completion = Depends(_get_owned_completion),
    session: AsyncSession = Depends(get_session),
) -> Completion:
    fields = body.model_fields_set

    if "value" in fields:
        # CompletionUpdate's own validator already guarantees value and unit
        # are both present here or both absent - never one without the other.
        if body.value is not None and completion.activity is not None:
            activity = Activity(completion.activity)
            assert body.unit is not None
            if body.unit not in ACTIVITY_UNITS[activity].permitted:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"{body.unit} is not a valid unit for {activity}",
                )
        completion.value = body.value
        completion.unit = body.unit.value if body.unit is not None else None

    if "note" in fields:
        completion.note = body.note

    session.add(completion)
    await session.commit()
    await session.refresh(completion)
    return completion


@router.delete("/{completion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_completion(
    completion: Completion = Depends(_get_owned_completion),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(completion)
    await session.commit()
