from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlmodel import SQLModel

from app.models import plan, schedule_entry, user, workout  # noqa: F401  (register on metadata)
from tests.conftest import test_engine

_REPO_ROOT = Path(__file__).resolve().parent.parent
_ALEMBIC_INI = _REPO_ROOT / "alembic.ini"


def test_single_head() -> None:
    """Branched heads are the most common way a migration silently never runs -
    `alembic upgrade head` only advances the branch it happens to resolve.
    """
    config = Config(str(_ALEMBIC_INI))
    script = ScriptDirectory.from_config(config)
    heads = script.get_heads()
    assert len(heads) == 1, f"expected exactly one migration head, found {heads}"


async def test_migrations_match_models() -> None:
    """The migrated test schema (built by conftest's session-scoped fixture) must
    match SQLModel.metadata with no diff.

    Blind spot: compare_metadata inherits autogenerate's name-based CHECK
    comparison, so a CHECK constraint whose name is unchanged but whose
    expression differs produces an empty diff here - it will NOT be caught by
    this test. That case is covered instead by the fact that the suite now runs
    against the migrated schema: a stale CHECK expression rejects the insert it
    was supposed to reject, and the relevant feature test fails.
    """
    async with test_engine.connect() as conn:
        diff = await conn.run_sync(
            lambda sync_conn: compare_metadata(
                MigrationContext.configure(sync_conn), SQLModel.metadata
            )
        )
    assert not diff, f"migrations and models disagree:\n{diff!r}"
