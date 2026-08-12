"""Exercises app.deps.get_current_user's provisioning logic end to end -
real JWTs via make_token against the plain client fixture, deliberately not
authed_client, since authed_client overrides get_current_user entirely and
would never touch the code path this file exists to test.
"""

from typing import Any
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.user import User
from tests.conftest import make_token


@pytest.mark.asyncio
async def test_new_user_provisioned_on_first_plans_post(
    client: AsyncClient, session: AsyncSession, make_plan: Any
) -> None:
    user_id = uuid4()
    email = "brand-new@example.com"
    client.headers["Authorization"] = f"Bearer {make_token(user_id, email)}"

    plan = await make_plan(client)
    assert plan["user_id"] == str(user_id)

    result = await session.exec(select(User).where(User.id == user_id))
    rows = list(result)
    assert len(rows) == 1
    assert rows[0].email == email


@pytest.mark.asyncio
async def test_second_request_from_same_user_does_not_duplicate_row(
    client: AsyncClient, session: AsyncSession, make_plan: Any
) -> None:
    user_id = uuid4()
    client.headers["Authorization"] = f"Bearer {make_token(user_id, 'repeat@example.com')}"

    await make_plan(client, name="First Plan", is_active=False)
    await make_plan(client, name="Second Plan", is_active=False)

    result = await session.exec(select(User).where(User.id == user_id))
    assert len(list(result)) == 1


@pytest.mark.asyncio
async def test_existing_row_email_is_not_overwritten(
    client: AsyncClient, session: AsyncSession, make_plan: Any
) -> None:
    user_id = uuid4()
    original_email = "original@example.com"
    session.add(User(id=user_id, email=original_email))
    await session.commit()

    client.headers["Authorization"] = f"Bearer {make_token(user_id, 'changed@example.com')}"
    plan = await make_plan(client)
    assert plan["user_id"] == str(user_id)

    result = await session.exec(select(User).where(User.id == user_id))
    rows = list(result)
    assert len(rows) == 1
    assert rows[0].email == original_email


@pytest.mark.asyncio
async def test_invalid_signature_does_not_provision(
    client: AsyncClient, session: AsyncSession
) -> None:
    user_id = uuid4()
    wrong_key = ec.generate_private_key(ec.SECP256R1())
    token = make_token(user_id, "bad-sig@example.com", private_key=wrong_key)

    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401

    result = await session.exec(select(User).where(User.id == user_id))
    assert list(result) == []


@pytest.mark.asyncio
async def test_expired_token_does_not_provision(client: AsyncClient, session: AsyncSession) -> None:
    user_id = uuid4()
    token = make_token(user_id, "expired@example.com", expired=True)

    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401

    result = await session.exec(select(User).where(User.id == user_id))
    assert list(result) == []


@pytest.mark.asyncio
async def test_two_different_users_each_get_their_own_row(
    client: AsyncClient, session: AsyncSession
) -> None:
    user_a_id, user_b_id = uuid4(), uuid4()
    token_a = make_token(user_a_id, "a@example.com")
    token_b = make_token(user_b_id, "b@example.com")

    resp_a = await client.get("/me", headers={"Authorization": f"Bearer {token_a}"})
    resp_b = await client.get("/me", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200

    result = await session.exec(select(User).where(User.id.in_([user_a_id, user_b_id])))
    rows = {row.id: row.email for row in result}
    assert rows == {user_a_id: "a@example.com", user_b_id: "b@example.com"}


@pytest.mark.asyncio
async def test_get_me_also_provisions(client: AsyncClient, session: AsyncSession) -> None:
    """Not special-cased to /plans - the shared dependency provisions
    regardless of which endpoint happens to be hit first.
    """
    user_id = uuid4()
    email = "me-endpoint@example.com"
    token = make_token(user_id, email)

    response = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200

    result = await session.exec(select(User).where(User.id == user_id))
    rows = list(result)
    assert len(rows) == 1
    assert rows[0].email == email
