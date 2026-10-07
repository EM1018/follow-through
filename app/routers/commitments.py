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
from app.services.commitments import (
    CHALLENGE_CAP,
    CommitmentStatus,
    Progress,
    blocks_new_challenge,
    compute_progress,
    derive_status,
    is_live_pending,
)
from app.services.dates import user_today

router = APIRouter(prefix="/commitments", tags=["commitments"])


def _last_block_end(commitment: Commitment) -> date | None:
    """None for an ongoing goal - it never "finishes" on its own."""
    if commitment.duration_weeks is None:
        return None
    assert commitment.starts_on is not None  # goals always have one - ck_commitments_goal_shape
    return commitment.starts_on + timedelta(days=7 * commitment.duration_weeks - 1)


def _finished_on(commitment: Commitment) -> date:
    """When a commitment that's over stopped, for sorting the finished list."""
    if commitment.ended_on is not None:
        return commitment.ended_on
    if commitment.starts_on is None:
        # An invite that was never accepted has no clock to have run out - all
        # there is to place it by is when it was sent.
        return commitment.created_at.date()
    return _last_block_end(commitment) or date.min


def _read_commitment(
    commitment: Commitment, completions: Sequence[Completion], today: date
) -> CommitmentRead:
    return _to_read(commitment, compute_progress(commitment, completions, today))


def _read_challenge_terms(commitment: Commitment) -> CommitmentRead:
    """A challenge as the list read returns it for now: its terms and where
    its invite stands, with progress left empty rather than computed.

    Empty, not compute_progress() over no completions - that would walk the
    blocks and report every elapsed week as missed, which is a claim about
    someone's training rather than the absence of one.
    """
    not_computed = Progress(
        blocks=[],
        current_streak=0,
        longest_streak=0,
        weeks_passed=0,
        weeks_total=commitment.duration_weeks or 0,
    )
    return _to_read(commitment, not_computed)


def _to_read(commitment: Commitment, progress: Progress) -> CommitmentRead:
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
    if commitment.starts_on is None:
        # A challenge nobody has accepted yet. Its clock hasn't started, so
        # no completion can count toward it and there's no window to query -
        # and SQL can't order-compare a date against NULL anyway.
        return _read_commitment(commitment, [], today)

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
INVITE_UNAVAILABLE = "invite_unavailable"
INVITE_NOT_PENDING = "invite_not_pending"
INVITE_EXPIRED = "invite_expired"
CHALLENGE_CAP_REACHED = "challenge_cap_reached"
CHALLENGE_ALREADY_ACCEPTED = "challenge_already_accepted"
CHALLENGE_NOT_ACTIVE = "challenge_not_active"

# Why a challenge that isn't active can't be quit, by what it is instead.
_NOT_QUITTABLE: dict[CommitmentStatus, str] = {
    CommitmentStatus.SENT: "This invite hasn't been accepted yet - withdraw it instead",
    CommitmentStatus.INVITE: "This invite hasn't been accepted yet - decline it instead",
    CommitmentStatus.EXPIRED: "This invite expired before it was accepted",
    CommitmentStatus.DECLINED: "This invite was declined",
    CommitmentStatus.ENDED_EARLY: "This challenge has already been ended",
    CommitmentStatus.FINISHED: "This challenge has already finished",
}


# An invite that went nowhere is the sender's to see and nobody else's. With
# no push system that card is how they find out what happened to it; the
# recipient already answered or let it lapse, and has nothing left to do.
_SENDER_ONLY = frozenset({CommitmentStatus.DECLINED, CommitmentStatus.EXPIRED})

# What the list read's `active` bucket holds: anything still running or still
# waiting on an answer. Everything else is over and goes in `finished`.
_STILL_OPEN = frozenset({CommitmentStatus.ACTIVE, CommitmentStatus.SENT, CommitmentStatus.INVITE})


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
        # Everything the caller takes part in. A goal has no recipient, so
        # only the first clause can ever match one - goals stay creator-only.
        select(Commitment).where(
            or_(Commitment.creator_id == db_user.id, Commitment.recipient_id == db_user.id)
        )
    )
    commitments = list(result)

    # The query answers "may I see this row at all" - participation, the same
    # for both sides. Whether it belongs in the caller's list right now is a
    # second question with a different answer per side, and it's decided
    # here rather than in SQL because it turns on expiry: derive_status() gets
    # that from is_live_pending(), the one copy of the 14-day rule that accept
    # and send also go by. A WHERE clause would be a second copy, and if the
    # two drifted an expired invite could drop out of both lists while still
    # blocking a new send. The cost is fetching a few rows to discard them.
    active: list[Commitment] = []
    finished: list[Commitment] = []
    for c in commitments:
        c_status = derive_status(c, db_user.id, today)
        if c_status in _SENDER_ONLY and c.creator_id != db_user.id:
            continue
        if c_status in _STILL_OPEN:
            active.append(c)
        else:
            finished.append(c)
    # Unanswered invites first, then newest first within each group - a
    # received invite is waiting on the caller and shouldn't sit below rows
    # that aren't. Anything pending that made it into this bucket is live:
    # an expired one went to `finished` above, or was dropped.
    active.sort(key=lambda c: (c.invite_status == InviteStatus.PENDING, c.created_at), reverse=True)
    finished.sort(key=_finished_on, reverse=True)

    async def read(commitment: Commitment) -> CommitmentRead:
        if commitment.recipient_id is not None:
            return _read_challenge_terms(commitment)
        return await _build_read(session, commitment, today)

    return CommitmentsListResponse(
        active=[await read(c) for c in active],
        finished=[await read(c) for c in finished],
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
    commitment_id: uuid.UUID,
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    # Ending is a state transition, not an edit - terms (duration_weeks,
    # sessions_per_week, ...) are frozen at creation and stay that way here.
    today = user_today(db_user)

    # Locked so two participants quitting at the same moment can't both land:
    # the second waits, then finds it already ended.
    commitment = await session.get(Commitment, commitment_id, with_for_update=True)
    # A goal has one owner; a challenge has two, and either may end it.
    # recipient_id is NULL on a goal, so it can never match a caller there.
    if commitment is None or db_user.id not in (commitment.creator_id, commitment.recipient_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commitment not found")

    # Only something still running can be ended. For a challenge, an
    # unanswered invite is withdrawn or declined instead, and one that's over
    # has nothing left to end.
    current_status = derive_status(commitment, db_user.id, today)
    if current_status != CommitmentStatus.ACTIVE:
        if commitment.recipient_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Commitment has already ended"
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": CHALLENGE_NOT_ACTIVE,
                "message": _NOT_QUITTABLE[current_status],
            },
        )

    # The caller's today - whoever takes the action is the one whose calendar
    # decides the date, same as starts_on at accept.
    commitment.ended_on = today
    # ended_on says it ended; this says who ended it, which on a challenge is
    # the difference between "you ended this" and "they did". Redundant on a
    # goal, but stamped there too so nothing downstream special-cases a NULL.
    commitment.ended_by_id = db_user.id
    session.add(commitment)
    await session.commit()
    await session.refresh(commitment)
    return await _build_read(session, commitment, today)


async def _count_running_challenges(session: AsyncSession, user_id: uuid.UUID, today: date) -> int:
    """Accepted challenges `user_id` is in, on either side, that are still
    going. Goals never match - they have no invite_status.

    SQL narrows to accepted rows nobody quit; whether one has run past its end
    date depends on today, so that last part is derive_status()'s call, the
    same as everywhere else that asks "is this active".
    """
    result = await session.exec(
        select(Commitment).where(
            or_(Commitment.creator_id == user_id, Commitment.recipient_id == user_id),
            Commitment.invite_status == InviteStatus.ACCEPTED,
            Commitment.ended_on.is_(None),
        )
    )
    return sum(
        1
        for commitment in result
        if derive_status(commitment, user_id, today) == CommitmentStatus.ACTIVE
    )


async def _lock_pending_invite_for_recipient(
    session: AsyncSession, commitment_id: uuid.UUID, user_id: uuid.UUID
) -> Commitment:
    """The two guards every recipient-side answer starts with: the caller is
    the recipient, and the invite hasn't been answered yet.

    FOR UPDATE makes a simultaneous accept/decline/withdraw of the same row
    wait for this one and then see what it did. The lock is held until the
    caller commits, so the read and the write that follows are one
    transaction.
    """
    commitment = await session.get(Commitment, commitment_id, with_for_update=True)
    # 404, not 403, for the creator and for strangers alike - a 403 would
    # confirm the id exists. The same answer covers a recipient whose invite
    # was withdrawn a moment ago: the row is gone, so "never existed" and
    # "withdrawn" can't be told apart here, and the wording is the one thing
    # true of both. The code lets the client say so and refetch.
    if commitment is None or commitment.recipient_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": INVITE_UNAVAILABLE,
                "message": "This invite is no longer available - it may have been withdrawn",
            },
        )

    if commitment.invite_status != InviteStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": INVITE_NOT_PENDING,
                "message": f"This invite has already been {commitment.invite_status}",
            },
        )

    return commitment


@router.post("/{commitment_id}/accept", response_model=CommitmentRead)
async def accept_challenge(
    commitment_id: uuid.UUID,
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    today = user_today(db_user)
    commitment = await _lock_pending_invite_for_recipient(session, commitment_id, db_user.id)

    if not is_live_pending(commitment, today):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": INVITE_EXPIRED, "message": "This invite has expired"},
        )

    # The cap is per person, across different invites, so the invite's lock
    # alone isn't enough: two accepts of two different invites could both
    # count 4 and both commit. Locking the accepter's own users row lines
    # those up - the second waits here, then counts with the first included.
    await session.exec(select(User.id).where(User.id == db_user.id).with_for_update())
    if await _count_running_challenges(session, db_user.id, today) >= CHALLENGE_CAP:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": CHALLENGE_CAP_REACHED,
                "message": f"You already have {CHALLENGE_CAP} challenges running",
            },
        )

    commitment.invite_status = InviteStatus.ACCEPTED
    # The accepter's today, not the sender's - they're the one acting, and
    # this one date is what gives both participants the same week boundaries.
    commitment.starts_on = today
    session.add(commitment)
    await session.commit()
    await session.refresh(commitment)
    return await _build_read(session, commitment, today)


@router.post("/{commitment_id}/decline", response_model=CommitmentRead)
async def decline_challenge(
    commitment_id: uuid.UUID,
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> CommitmentRead:
    today = user_today(db_user)
    commitment = await _lock_pending_invite_for_recipient(session, commitment_id, db_user.id)

    # Neither of accept's other two guards applies. The cap is never read:
    # declining is how someone at the limit gets back under it. And an expired
    # invite can still be declined - it just becomes declined instead of lapsing.
    #
    # The row stays. There's no push system, so the declined card on the
    # sender's side is how they find out; they clear it themselves (dismiss).
    commitment.invite_status = InviteStatus.DECLINED
    session.add(commitment)
    await session.commit()
    await session.refresh(commitment)
    # Never started, so there are no completions that could count toward it.
    return _read_commitment(commitment, [], today)


@router.delete("/{commitment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_commitment(
    commitment_id: uuid.UUID,
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """One verb, three meanings, told apart by the row's state: deleting a
    goal, withdrawing an invite nobody has answered, and dismissing the
    declined or expired card left behind by one that went nowhere.

    Creator-only in every case. The recipient has no card of their own to
    clear - one row holds both sides - so for them this is a 404.
    """
    # Locked for the same reason the recipient's side locks it: a withdraw
    # racing an accept has to wait and then see who won.
    commitment = await session.get(Commitment, commitment_id, with_for_update=True)
    if commitment is None or commitment.creator_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commitment not found")

    # Pending (live or expired) and declined both fall through to the delete.
    # Accepted never does, running or not: from accept on the row belongs to
    # two people, and you quit a challenge, you don't delete it.
    if commitment.invite_status == InviteStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": CHALLENGE_ALREADY_ACCEPTED,
                "message": "This challenge has already been accepted and can't be deleted",
            },
        )

    # No FK from completions to commitments, by design - a completion is a
    # fact about the user, not a child of a goal, so this never touches
    # tests/other tables and needs no cascading cleanup of its own.
    await session.delete(commitment)
    await session.commit()
