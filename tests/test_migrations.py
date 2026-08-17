from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlmodel import SQLModel

from app.models import (  # noqa: F401  (register on metadata)
    completion,
    plan,
    schedule_entry,
    user,
    workout,
)
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

    Blind spot, confirmed empirically (not just documented) by deliberately
    deleting a CHECK constraint from a migration and rerunning this test: it
    stayed green. compare_metadata does not reliably detect CHECK constraint
    drift at all in this Alembic/SQLAlchemy combination - not just an
    expression change under a matching name, but a constraint entirely absent
    from the model's declared set. That case is covered instead by the fact
    that the suite runs against the migrated schema: a missing or stale CHECK
    lets an invalid insert through, and the relevant feature/constraint test
    fails. See tests/test_constraints.py for the tests that actually exercise
    each CHECK end to end, which is what makes this gap survivable.
    """
    async with test_engine.connect() as conn:
        diff = await conn.run_sync(
            lambda sync_conn: compare_metadata(
                MigrationContext.configure(sync_conn), SQLModel.metadata
            )
        )
    assert not diff, f"migrations and models disagree:\n{diff!r}"
