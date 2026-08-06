import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import update
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user, get_owned_plan
from app.models.plan import Plan
from app.schemas.plan import PlanCreate, PlanRead, PlanUpdate

router = APIRouter(prefix="/plans", tags=["plans"])


async def _deactivate_other_plans(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    except_plan_id: uuid.UUID | None = None,
) -> None:
    # a direct bulk UPDATE (not load-then-mutate) executes immediately, guaranteeing
    # this lands in the DB before the caller's own activate/insert - the partial
    # unique index checks after every statement, so relying on the ORM's own flush
    # ordering here can momentarily have two rows active at once and fail
    statement = update(Plan).where(Plan.user_id == user_id, Plan.is_active).values(is_active=False)
    if except_plan_id is not None:
        statement = statement.where(Plan.id != except_plan_id)
    await session.exec(statement)
    await session.flush()


@router.post("", response_model=PlanRead, status_code=status.HTTP_201_CREATED)
async def create_plan(
    body: PlanCreate,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Plan:
    if body.is_active:
        await _deactivate_other_plans(session, current_user.user_id)

    plan = Plan(user_id=current_user.user_id, **body.model_dump())
    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


@router.get("", response_model=list[PlanRead])
async def list_plans(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Plan]:
    result = await session.exec(
        select(Plan).where(Plan.user_id == current_user.user_id).order_by(Plan.created_at.desc())
    )
    return list(result)


@router.get("/{plan_id}", response_model=PlanRead)
async def get_plan(plan: Plan = Depends(get_owned_plan)) -> Plan:
    return plan


@router.patch("/{plan_id}", response_model=PlanRead)
async def update_plan(
    body: PlanUpdate,
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> Plan:
    updates = body.model_dump(exclude_unset=True)

    # validate against the *effective* result of this patch, since a partial
    # update might only send one of starts_on/ends_on
    effective_starts_on = updates.get("starts_on", plan.starts_on)
    effective_ends_on = updates.get("ends_on", plan.ends_on)
    if effective_ends_on is not None and effective_ends_on < effective_starts_on:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="ends_on must be on or after starts_on",
        )

    if updates.get("is_active") is True:
        await _deactivate_other_plans(session, plan.user_id, except_plan_id=plan.id)

    for field, value in updates.items():
        setattr(plan, field, value)

    session.add(plan)
    await session.commit()
    await session.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(
    plan: Plan = Depends(get_owned_plan),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.delete(plan)
    await session.commit()
