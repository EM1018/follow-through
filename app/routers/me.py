from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import get_current_db_user
from app.models.user import User
from app.schemas.user import MeRead, MeUpdate

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeRead)
async def get_me(db_user: User = Depends(get_current_db_user)) -> User:
    return db_user


@router.patch("/me", response_model=MeRead)
async def update_me(
    body: MeUpdate,
    db_user: User = Depends(get_current_db_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    fields = body.model_fields_set
    if "timezone" in fields:
        db_user.timezone = body.timezone
    if "username" in fields:
        db_user.username = body.username

    session.add(db_user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        if "ix_users_username" in str(exc.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Username is already taken"
            ) from exc
        raise

    await session.refresh(db_user)
    return db_user
