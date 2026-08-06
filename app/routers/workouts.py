import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import get_owned_plan
from app.models.plan import Plan
from app.models.workout import Workout
from app.schemas.workout import WorkoutCreate, WorkoutRead, WorkoutUpdate

router = APIRouter(prefix="/plans/{plan_id}/workouts", tags=["workouts"])


async def _get_owned_workout(
    workout_id: uuid.UUID,
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> Workout:
    workout = await session.get(Workout, workout_id)
    if workout is None or workout.plan_id != plan.id:
        # same 404 whether the workout doesn't exist or belongs to a different plan -
        # a real workout_id fetched via the wrong plan_id must not be distinguishable
        # from a workout_id that doesn't exist at all
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return workout


@router.post("", response_model=WorkoutRead, status_code=status.HTTP_201_CREATED)
async def create_workout(
    body: WorkoutCreate,
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> Workout:
    workout = Workout(plan_id=plan.id, **body.model_dump())
    session.add(workout)
    await session.commit()
    await session.refresh(workout)
    return workout


@router.get("", response_model=list[WorkoutRead])
async def list_workouts(
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> list[Workout]:
    result = await session.exec(
        select(Workout).where(Workout.plan_id == plan.id).order_by(Workout.created_at.desc())
    )
    return list(result)


@router.patch("/{workout_id}", response_model=WorkoutRead)
async def update_workout(
    body: WorkoutUpdate,
    workout: Workout = Depends(_get_owned_workout),
    session: AsyncSession = Depends(get_session),
) -> Workout:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(workout, field, value)

    session.add(workout)
    await session.commit()
    await session.refresh(workout)
    return workout


@router.delete("/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(
    workout: Workout = Depends(_get_owned_workout),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(workout)
    await session.commit()
