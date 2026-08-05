import os
from collections.abc import AsyncGenerator, Generator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import jwt
import pytest
import pytest_asyncio
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePrivateKey
from httpx import ASGITransport, AsyncClient
from jwt.algorithms import ECAlgorithm
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.db import get_session
from app.deps import CurrentUser, get_current_user
from app.models import user as _user  # noqa: F401  (registers User on SQLModel.metadata)
from app.models.user import User

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5433/follow_through_test",
)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

# One EC keypair for the whole test session. Its public half is served as a fake JWKS
# (see _patch_jwks_fetch below), so app.deps's real ES256 + JWKS verification path
# runs end-to-end in tests without ever calling out to a real Supabase project.
TEST_KID = "test-key-1"
_TEST_EC_KEY = ec.generate_private_key(ec.SECP256R1())


def _fake_jwks() -> dict[str, Any]:
    jwk = ECAlgorithm.to_jwk(_TEST_EC_KEY.public_key(), as_dict=True)
    jwk["kid"] = TEST_KID
    jwk["use"] = "sig"
    return {"keys": [jwk]}


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _create_tables() -> AsyncGenerator[None, None]:
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _truncate_tables() -> AsyncGenerator[None, None]:
    yield
    async with test_engine.begin() as conn:
        table_names = ", ".join(f'"{table.name}"' for table in SQLModel.metadata.sorted_tables)
        if table_names:
            await conn.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))


# The real fetch_data, stashed here so tests/test_jwks.py can temporarily restore
# it (via monkeypatch) to exercise the real method body against a respx-mocked
# HTTP layer, instead of this session-wide fake.
real_jwks_fetch_data: Any = None


@pytest.fixture(scope="session", autouse=True)
def _patch_jwks_fetch() -> Generator[None, None, None]:
    """Serve our fake JWKS instead of calling out to a real Supabase project."""
    from app.deps import _HttpxPyJWKClient

    global real_jwks_fetch_data
    real_jwks_fetch_data = _HttpxPyJWKClient.fetch_data
    _HttpxPyJWKClient.fetch_data = lambda self: _fake_jwks()
    yield
    _HttpxPyJWKClient.fetch_data = real_jwks_fetch_data


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    async with test_session_maker() as session:
        yield session


async def _override_get_session() -> AsyncGenerator[AsyncSession, None]:
    """Routes app.db.get_session to the test DB (5433) instead of DATABASE_URL (dev, 5432)."""
    async with test_session_maker() as session:
        yield session


async def _create_user_row(current_user: CurrentUser) -> None:
    """Fast-path fixtures fabricate a CurrentUser without a real login, but any table
    with a real FK to users.id (plans, workouts, ...) needs that row to actually
    exist. Without this, inserts fail with a ForeignKeyViolationError.
    """
    async with test_session_maker() as db_session:
        db_session.add(User(id=current_user.user_id, email=current_user.email))
        await db_session.commit()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    from app.main import app

    app.dependency_overrides[get_session] = _override_get_session

    transport = ASGITransport(app=app)
    # just needs a placeholder, hence test url
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.pop(get_session, None)


# helper to create a dummy token for testing, removing the need to go to supabase
def make_token(
    user_id: UUID,
    email: str,
    *,
    expired: bool = False,
    kid: str = TEST_KID,
    private_key: EllipticCurvePrivateKey | None = None,
) -> str:
    """Sign a JWT the same way Supabase would: ES256, matching the fake JWKS by default."""
    now = datetime.now(UTC)
    exp = now - timedelta(minutes=5) if expired else now + timedelta(hours=1)
    payload = {
        "sub": str(user_id),
        "email": email,
        "aud": "authenticated",
        "iat": now,
        "exp": exp,
    }
    key = private_key or _TEST_EC_KEY
    return jwt.encode(payload, key, algorithm="ES256", headers={"kid": kid})


@dataclass
class AuthedUser:
    headers: dict[str, str]
    user_id: UUID
    email: str


@pytest.fixture
def auth_headers() -> AuthedUser:
    """A valid Authorization header plus the identity it encodes, for asserting against.
    Test can send and check response against it.
    """
    user_id = uuid4()
    email = "athlete@example.com"
    token = make_token(user_id, email)
    # fast api expects header format
    return AuthedUser(headers={"Authorization": f"Bearer {token}"}, user_id=user_id, email=email)


# for future tests not necessarily caring for auth mechanism
@pytest_asyncio.fixture
async def authed_client() -> AsyncGenerator[tuple[AsyncClient, CurrentUser], None]:
    """Alternative fast path for future endpoint tests: bypasses real JWT verification
    via FastAPI's dependency_overrides for tests that need an authenticated user but
    aren't exercising the auth mechanism itself.
    """
    from app.main import app

    current_user = CurrentUser(user_id=uuid4(), email="fast-path@example.com")
    await _create_user_row(current_user)
    app.dependency_overrides[get_current_user] = lambda: current_user
    app.dependency_overrides[get_session] = _override_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, current_user

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_session, None)


@pytest_asyncio.fixture
async def second_user() -> CurrentUser:
    """A second, distinct identity for ownership tests.

    get_current_user's override lives on the shared `app` object, so only one
    identity can be active at a time - there's no such thing as two simultaneous
    authed_client "personas". For ownership tests, reuse authed_client's client and
    reassign app.dependency_overrides[get_current_user] to this user immediately
    before the specific request that should act as someone else.
    """
    current_user = CurrentUser(user_id=uuid4(), email="second-user@example.com")
    await _create_user_row(current_user)
    return current_user
