import uuid
from collections.abc import Sequence
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_db_user, get_current_user
from app.models.commitment import Commitment
from app.models.completion import Completion
from app.models.user import User
from app.schemas.commitment import (
    CommitmentCreate,
    CommitmentRead,
    CommitmentsListResponse,
    ProgressRead,
)
from app.services.commitments import compute_progress
from app.services.dates import user_today

router = APIRouter(prefix="/commitments", tags=["commitments"])


def _last_block_end(commitment: Commitment) -> date | None:
    """None for an ongoing goal - it never "finishes" on its own."""
    if commitment.duration_weeks is None:
        return None
    assert commitment.starts_on is not None  # goals always have one - ck_commitments_goal_shape
    return commitment.starts_on + timedelta(days=7 * commitment.duration_weeks - 1)


def _is_finished(commitment: Commitment, today: date) -> bool:
    if commitment.ended_on is not None:
        return True
    last_block_end = _last_block_end(commitment)
    return last_block_end is not None and today > last_block_end


def _read_commitment(
    commitment: Commitment, completions: Sequence[Completion], today: date
) -> CommitmentRead:
    progress = compute_progress(commitment, completions, today)
    return CommitmentRead(
        id=commitment.id,
        creator_id=commitment.creator_id,
        recipient_id=commitment.recipient_id,
        activity=commitment.activity,
        target_value=float(commitment.target_value)
        if commitment.target_value is not None
        else None,
        target_unit=commitment.target_unit,
        sessions_per_week=commitment.sessions_per_week,
        duration_weeks=commitment.duration_weeks,
        starts_on=commitment.starts_on,
        ended_on=commitment.ended_on,
        invite_status=commitment.invite_status,
        rematch_of_id=commitment.rematch_of_id,
        created_at=commitment.created_at,
        progress=ProgressRead.model_validate(progress),
    )


async def _build_read(session: AsyncSession, commitment: Commitment, today: date) -> CommitmentRead:
    # completion_satisfies (inside compute_progress) already checks activity -
    # no need to filter by it here too, just bound the date window a goal's
    # own blocks could possibly draw from.
    result = await session.exec(
        select(Completion).where(
            Completion.user_id == commitment.creator_id,
            Completion.on_date >= commitment.starts_on,
            Completion.on_date <= today,
        )
    )
    return _read_commitment(commitment, list(result), today)


async def _get_owned_commitment(
    commitment_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Commitment:
    commitment = await session.get(Commitment, commitment_id)
    if commitment is None or commitment.creator_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commitment not found")
    return commitment


@router.post("", response_model=CommitmentRead, status_code=status.HTTP_201_CREATED)
async def create_commitment(
    body: CommitmentCreate,
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    today = user_today(db_user)
    commitment = Commitment(
        creator_id=db_user.id,
        recipient_id=None,
        activity=body.activity.value,
        target_value=body.target_value,
        target_unit=body.target_unit.value if body.target_unit is not None else None,
        sessions_per_week=body.sessions_per_week,
        duration_weeks=body.duration_weeks,
        starts_on=today,
        invite_status=None,
    )
    session.add(commitment)
    await session.commit()
    await session.refresh(commitment)
    # No query for existing completions here - a goal's progress starts empty
    # the moment it's created, by definition (its own blocks can't have begun
    # before starts_on, which is always today).
    return _read_commitment(commitment, [], today)


@router.get("", response_model=CommitmentsListResponse)
async def list_commitments(
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentsListResponse:
    today = user_today(db_user)
    result = await session.exec(
        select(Commitment).where(
            Commitment.creator_id == db_user.id,
            Commitment.recipient_id.is_(None),  # goals only - Stage 2 scope
        )
    )
    commitments = list(result)

    active = [c for c in commitments if not _is_finished(c, today)]
    finished = [c for c in commitments if _is_finished(c, today)]
    active.sort(key=lambda c: c.created_at, reverse=True)
    finished.sort(key=lambda c: c.ended_on or _last_block_end(c) or date.min, reverse=True)

    return CommitmentsListResponse(
        active=[await _build_read(session, c, today) for c in active],
        finished=[await _build_read(session, c, today) for c in finished],
    )


@router.get("/{commitment_id}", response_model=CommitmentRead)
async def get_commitment(
    commitment: Commitment = Depends(_get_owned_commitment),
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    today = user_today(db_user)
    return await _build_read(session, commitment, today)


@router.post("/{commitment_id}/end", response_model=CommitmentRead)
async def end_commitment(
    commitment: Commitment = Depends(_get_owned_commitment),
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    # Ending is a state transition, not an edit - terms (duration_weeks,
    # sessions_per_week, ...) are frozen at creation and stay that way here.
    today = user_today(db_user)
    if commitment.ended_on is not None or _is_finished(commitment, today):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Commitment has already ended"
        )

    commitment.ended_on = today
    session.add(commitment)
    await session.commit()
    await session.refresh(commitment)
    return await _build_read(session, commitment, today)


@router.delete("/{commitment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_commitment(
    commitment: Commitment = Depends(_get_owned_commitment),
    session: AsyncSession = Depends(get_session),
) -> None:
    # No FK from completions to commitments, by design - a completion is a
    # fact about the user, not a child of a goal, so this never touches
    # tests/other tables and needs no cascading cleanup of its own.
    await session.delete(commitment)
    await session.commit()
