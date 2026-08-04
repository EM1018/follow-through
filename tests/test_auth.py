from uuid import uuid4

import httpx
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient

from tests.conftest import AuthedUser, make_token


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
    # signed with a *different* EC key than the one behind our fake JWKS's kid,
    # so the kid resolves fine but the signature itself doesn't verify
    wrong_key = ec.generate_private_key(ec.SECP256R1())
    token = make_token(uuid4(), "wrong-sig@example.com", private_key=wrong_key)
    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_with_unknown_kid_is_401(client: AsyncClient) -> None:
    token = make_token(uuid4(), "ghost@example.com", kid="does-not-exist")
    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_when_jwks_endpoint_unreachable_is_503(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.deps import _HttpxPyJWKClient

    def _raise(self: _HttpxPyJWKClient) -> None:
        raise httpx.ConnectError("JWKS endpoint unreachable")

    monkeypatch.setattr(_HttpxPyJWKClient, "fetch_data", _raise)

    # an unrecognized kid forces a real fetch attempt even if the cache is warm
    token = make_token(uuid4(), "unreachable@example.com", kid="not-in-cache")
    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 503


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
