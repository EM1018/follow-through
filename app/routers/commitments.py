import uuid
from collections.abc import Sequence
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func, or_
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_db_user, get_current_user
from app.models.commitment import Commitment, InviteStatus
from app.models.completion import Completion
from app.models.user import User
from app.schemas.commitment import (
    CommitmentCreate,
    CommitmentRead,
    CommitmentsListResponse,
    ProgressRead,
)
from app.services.commitments import blocks_new_challenge, compute_progress
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


# Machine-readable codes for the two challenge rejections the client reacts to
# rather than just displays. Sent as detail={"code", "message"} - both are
# 409s, and so is an ended commitment, so the status alone can't tell them apart.
USERNAME_REQUIRED = "username_required"
DUPLICATE_CHALLENGE = "duplicate_challenge"


async def _resolve_challenge_recipient(
    session: AsyncSession, body: CommitmentCreate, sender: User, today: date
) -> User:
    """Runs the send-time checks in order and returns who the challenge is for.

    No cap check here on purpose: the 5-challenge cap protects the recipient
    from overcommitting, so it's enforced when they accept. Rejecting at send
    would also tell the sender something about the recipient's state.
    """
    # A challenge card names its sender - without a username the recipient
    # gets a card they can't read. Its own code so the client can point the
    # sender at Profile instead of showing a dead-end error.
    if sender.username is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": USERNAME_REQUIRED,
                "message": "Set a username before sending a challenge",
            },
        )

    # lower() on both sides, not ==: that's the expression uq_users_username_lower
    # indexes, and what makes "TestUser" findable as "testuser".
    result = await session.exec(
        select(User).where(func.lower(User.username) == func.lower(body.recipient_username))
    )
    recipient = result.first()
    if recipient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Resolved ids, not the typed strings - "Sam" and "sam" are the same person.
    if recipient.id == sender.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="You cannot challenge yourself",
        )

    # The pair is unordered: "these two already have this going", whoever sent
    # it. Only the pair and activity are filtered in SQL - whether a row still
    # counts depends on today's date, so that part is decided in Python by the
    # same functions every other read uses. It's also why no index backs this
    # rule: a date comparison against today can't live in one.
    result = await session.exec(
        select(Commitment).where(
            Commitment.activity == body.activity.value,
            or_(
                and_(Commitment.creator_id == sender.id, Commitment.recipient_id == recipient.id),
                and_(Commitment.creator_id == recipient.id, Commitment.recipient_id == sender.id),
            ),
        )
    )
    if any(blocks_new_challenge(existing, today) for existing in result):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": DUPLICATE_CHALLENGE,
                "message": "You already have a challenge with this person for this activity",
            },
        )

    # Ongoing is a goal-only term - a challenge needs an end for there to be a
    # result. The 1-8 range itself is already enforced by CommitmentCreate.
    if body.duration_weeks is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="duration_weeks is required for a challenge",
        )

    return recipient


@router.post("", response_model=CommitmentRead, status_code=status.HTTP_201_CREATED)
async def create_commitment(
    body: CommitmentCreate,
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    today = user_today(db_user)
    recipient = (
        await _resolve_challenge_recipient(session, body, db_user, today)
        if body.recipient_username is not None
        else None
    )
    commitment = Commitment(
        creator_id=db_user.id,
        recipient_id=recipient.id if recipient is not None else None,
        activity=body.activity.value,
        target_value=body.target_value,
        target_unit=body.target_unit.value if body.target_unit is not None else None,
        sessions_per_week=body.sessions_per_week,
        duration_weeks=body.duration_weeks,
        # A challenge's clock starts at accept, not send, so both participants
        # share one set of week boundaries - NULL until then.
        starts_on=today if recipient is None else None,
        invite_status=InviteStatus.PENDING if recipient is not None else None,
    )
    session.add(commitment)
    await session.commit()
    await session.refresh(commitment)
    # No query for existing completions here - progress starts empty the
    # moment a commitment is created, by definition (a goal's blocks can't have
    # begun before starts_on, which is always today; a challenge has none yet).
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
