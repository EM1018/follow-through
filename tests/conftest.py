import asyncio
import os
from collections.abc import AsyncGenerator, Callable, Generator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import jwt
import pytest
import pytest_asyncio
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.ec import EllipticCurvePrivateKey
from httpx import ASGITransport, AsyncClient
from jwt.algorithms import ECAlgorithm
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from alembic import command
from app.config import get_settings
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

_REPO_ROOT = Path(__file__).resolve().parent.parent
_ALEMBIC_INI = _REPO_ROOT / "alembic.ini"


def _assert_test_db_is_not_dev() -> None:
    """Called before both migrating and dropping - either against the wrong
    database would be irreversible, so this is checked at both call sites
    rather than trusting the earlier check still holds.
    """
    dev_url = get_settings().DATABASE_URL
    if TEST_DATABASE_URL == dev_url:
        raise RuntimeError(
            "TEST_DATABASE_URL matches the app's configured DATABASE_URL - "
            "refusing to run migrations or drop a schema to avoid touching dev."
        )


async def _upgrade_test_db_to_head() -> None:
    """alembic/env.py:27 unconditionally sets sqlalchemy.url from
    app.config.get_settings().DATABASE_URL, ignoring alembic.ini and any
    config.set_main_option() call made beforehand - so pointing migrations at
    the test DB means overriding *that* source (env var + lru_cache), not the
    Alembic Config object.
    """
    _assert_test_db_is_not_dev()
    dev_url = get_settings().DATABASE_URL

    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    get_settings.cache_clear()
    try:
        resolved = get_settings().DATABASE_URL
        if resolved != TEST_DATABASE_URL or resolved == dev_url:
            raise RuntimeError(
                f"Refusing to run migrations: resolved DATABASE_URL {resolved!r} "
                "does not look like the test database."
            )

        config = Config(str(_ALEMBIC_INI))
        # env.py's run_migrations_online() calls asyncio.run(), which raises if
        # invoked from inside pytest-asyncio's already-running session loop -
        # to_thread gives Alembic a fresh thread with no event loop of its own.
        await asyncio.to_thread(command.upgrade, config, "head")
    finally:
        if dev_url is not None:
            os.environ["DATABASE_URL"] = dev_url
        else:
            os.environ.pop("DATABASE_URL", None)
        get_settings.cache_clear()


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
    await _upgrade_test_db_to_head()
    yield
    _assert_test_db_is_not_dev()
    async with test_engine.begin() as conn:
        # metadata.drop_all wouldn't remove alembic_version (it isn't part of
        # SQLModel.metadata), which would leave the next session believing the
        # schema is already at head while the tables are gone.
        await conn.execute(text("DROP SCHEMA public CASCADE"))
        await conn.execute(text("CREATE SCHEMA public"))
    await test_engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _truncate_tables() -> AsyncGenerator[None, None]:
    yield
    async with test_engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name != 'alembic_version'"
            )
        )
        table_names = ", ".join(f'"{row[0]}"' for row in result)
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

    This still exists even though app.deps.get_current_user now provisions the
    row itself, because authed_client overrides get_current_user entirely -
    the real dependency (and its provisioning) never runs for fast-path tests.
    The real provisioning path is covered end-to-end in
    tests/test_user_provisioning.py, which uses the plain client fixture and
    real JWTs specifically so get_current_user's own logic is what's tested.
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


@pytest.fixture
def make_plan() -> Callable[..., Any]:
    """Composable plan factory: POSTs to the real /plans endpoint (using whichever
    client and identity are currently active) rather than inserting rows directly,
    so tests that need "a plan to hang workouts off of" don't duplicate plan-creation
    logic that already lives in app/routers/plans.py.
    """

    async def _make_plan(client: AsyncClient, **overrides: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "name": "Test Plan",
            "starts_on": datetime.now(UTC).date().isoformat(),
            "ends_on": None,
            "visible_to_friends": False,
        }
        payload.update(overrides)
        response = await client.post("/plans", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _make_plan


@pytest.fixture
def make_workout() -> Callable[..., Any]:
    """Composable workout factory, mirroring make_plan: POSTs to the real
    /plans/{plan_id}/workouts endpoint rather than inserting rows directly.
    """

    async def _make_workout(client: AsyncClient, plan_id: str, **overrides: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {"name": "Test Workout", "notes": None}
        payload.update(overrides)
        response = await client.post(f"/plans/{plan_id}/workouts", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _make_workout


@pytest.fixture
def make_entry() -> Callable[..., Any]:
    """Composable schedule-entry factory, mirroring make_workout: POSTs to the
    real /plans/{plan_id}/schedule-entries endpoint. Defaults to a Monday
    recurring entry - pass on_date=... to build a dated entry instead (the
    default day_of_week is dropped automatically so the two don't collide).
    """

    async def _make_entry(client: AsyncClient, plan_id: str, **overrides: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {} if "on_date" in overrides else {"day_of_week": 1}
        payload.update(overrides)
        response = await client.post(f"/plans/{plan_id}/schedule-entries", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _make_entry
