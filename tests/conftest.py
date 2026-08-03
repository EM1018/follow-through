import os
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.deps import CurrentUser, get_current_user
from app.models import user as _user  # noqa: F401  (registers User on SQLModel.metadata)

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5433/follow_through_test",
)

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


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


@pytest_asyncio.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    async with test_session_maker() as session:
        yield session


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    from app.main import app

    transport = ASGITransport(app=app)
    # just needs a placeholder, hence test url
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

# helper to create a dummy token for testing, removing the need to go to supabase
def make_token(user_id: UUID, email: str, *, expired: bool = False) -> str:
    """Sign a JWT the same way Supabase would, using the test env's shared secret."""
    now = datetime.now(UTC)
    exp = now - timedelta(minutes=5) if expired else now + timedelta(hours=1)
    payload = {
        "sub": str(user_id),
        "email": email,
        "aud": "authenticated",
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, get_settings().SUPABASE_JWT_SECRET, algorithm="HS256")


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
    app.dependency_overrides[get_current_user] = lambda: current_user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac, current_user

    app.dependency_overrides.pop(get_current_user, None)
