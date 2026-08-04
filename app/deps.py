from dataclasses import dataclass
from typing import Any
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, PyJWKClientError

from app.config import get_settings

_bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

_JWKS_UNAVAILABLE = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="Could not reach the auth key provider",
)


@dataclass
class CurrentUser:
    user_id: UUID
    email: str


class _HttpxPyJWKClient(PyJWKClient):
    """PyJWKClient fetches over urllib by default; use httpx instead, per project convention."""

    def fetch_data(self) -> Any:
        response = httpx.get(self.uri, headers=self.headers, timeout=self.timeout)
        response.raise_for_status()
        data = response.json()
        if self.jwk_set_cache is not None:
            self.jwk_set_cache.put(data)
        return data


_jwk_client: _HttpxPyJWKClient | None = None


def _get_jwk_client() -> _HttpxPyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        # lifespan is the in-process cache TTL (seconds); get_signing_key() already
        # refreshes once and retries on an unrecognized kid, so key rotation is handled.
        _jwk_client = _HttpxPyJWKClient(get_settings().SUPABASE_JWKS_URL, lifespan=600)
    return _jwk_client


# checks if token is valid
# snatches user id and email
# security guard
async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise _UNAUTHORIZED

    token = credentials.credentials

    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
    except httpx.HTTPError as exc:
        raise _JWKS_UNAVAILABLE from exc
    except (PyJWKClientError, InvalidTokenError) as exc:
        raise _UNAUTHORIZED from exc

    try:
        payload = jwt.decode(token, signing_key.key, algorithms=["ES256"], audience="authenticated")
    except InvalidTokenError as exc:
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
