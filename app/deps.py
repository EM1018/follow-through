from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import get_settings

_bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


@dataclass
class CurrentUser:
    user_id: UUID
    email: str


# checks if token is valid 
# snatches user id and email 
# security guard
async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise _UNAUTHORIZED

    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        raise _UNAUTHORIZED from exc

    sub = payload.get("sub")
    email = payload.get("email")
    if sub is None or email is None:
        raise _UNAUTHORIZED

    try:
        user_id = UUID(sub)
    except ValueError as exc:
        raise _UNAUTHORIZED from exc

    return CurrentUser(user_id=user_id, email=email)
