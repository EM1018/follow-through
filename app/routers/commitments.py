import uuid
from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models.commitment import Commitment
from app.models.completion import Completion
from app.schemas.commitment import (
    CommitmentCreate,
    CommitmentRead,
    CommitmentsListResponse,
    ProgressRead,
)
from app.services.commitments import compute_progress

router = APIRouter(prefix="/commitments", tags=["commitments"])


def _last_block_end(commitment: Commitment) -> date | None:
    """None for an ongoing goal - it never "finishes" on its own."""
    if commitment.duration_weeks is None:
        return None
    assert commitment.starts_on is not None  # goals always have one - ck_commitments_goal_shape
    return commitment.starts_on + timedelta(days=7 * commitment.duration_weeks - 1)


def _is_finished(commitment: Commitment, today: date) -> bool:
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
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    today = datetime.now(UTC).date()
    commitment = Commitment(
        creator_id=current_user.user_id,
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
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentsListResponse:
    today = datetime.now(UTC).date()
    result = await session.exec(
        select(Commitment).where(
            Commitment.creator_id == current_user.user_id,
            Commitment.recipient_id.is_(None),  # goals only - Stage 2 scope
        )
    )
    commitments = list(result)

    active = [c for c in commitments if not _is_finished(c, today)]
    finished = [c for c in commitments if _is_finished(c, today)]
    active.sort(key=lambda c: c.created_at, reverse=True)
    finished.sort(key=lambda c: _last_block_end(c) or date.min, reverse=True)

    return CommitmentsListResponse(
        active=[await _build_read(session, c, today) for c in active],
        finished=[await _build_read(session, c, today) for c in finished],
    )


@router.get("/{commitment_id}", response_model=CommitmentRead)
async def get_commitment(
    commitment: Commitment = Depends(_get_owned_commitment),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    today = datetime.now(UTC).date()
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
