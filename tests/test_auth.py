from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from jose import jwt

from tests.conftest import AuthedUser, make_token

# temp for testing actual 200 instead of 401 for wrong signature
from app.config import get_settings

@pytest.mark.asyncio
async def test_me_without_token_is_401(client: AsyncClient) -> None:
    response = await client.get("/me")
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_me_with_garbage_token_is_401(client: AsyncClient) -> None:
    response = await client.get("/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_with_expired_token_is_401(client: AsyncClient) -> None:
    token = make_token(uuid4(), "expired@example.com", expired=True)
    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_with_wrong_signature_is_401(client: AsyncClient) -> None:
    now = datetime.now(UTC)
    payload = {
        "sub": str(uuid4()),
        "email": "wrong-sig@example.com",
        "aud": "authenticated",
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    token = jwt.encode(payload, "definitely-not-the-real-secret",  algorithm="HS256")
    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_with_valid_token_creates_user_on_first_call(
    client: AsyncClient, auth_headers: AuthedUser
) -> None:
    response = await client.get("/me", headers=auth_headers.headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(auth_headers.user_id)
    assert body["email"] == auth_headers.email
    assert body["username"] is None


@pytest.mark.asyncio
async def test_me_returns_same_row_on_second_call(
    client: AsyncClient, auth_headers: AuthedUser
) -> None:
    first = await client.get("/me", headers=auth_headers.headers)
    second = await client.get("/me", headers=auth_headers.headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()
