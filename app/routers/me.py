from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models.user import User

router = APIRouter(tags=["me"])

# creates row on first request
# next time, simply return it'


@router.get("/me", response_model=User)
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.get(User, current_user.user_id)
    if user is None:
        user = User(id=current_user.user_id, email=current_user.email)
        session.add(user)
        await session.commit()
        await session.refresh(user)
    return user
