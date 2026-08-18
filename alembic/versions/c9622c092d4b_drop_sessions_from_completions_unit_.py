"""drop sessions from completions unit check constraint

Revision ID: c9622c092d4b
Revises: 837904deac92
Create Date: 2026-08-17 19:14:38.910174

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9622c092d4b"
down_revision: str | Sequence[str] | None = "837904deac92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_UNITS = "'minutes', 'hours', 'miles', 'kilometers', 'sessions', 'sets', 'reps'"
_NEW_UNITS = "'minutes', 'hours', 'miles', 'kilometers', 'sets', 'reps'"


def upgrade() -> None:
    """Upgrade schema."""
    # Postgres has no in-place edit for a CHECK constraint's expression -
    # dev data using 'sessions' must already be cleared (see Prompt 18 Stage
    # 1) before this runs, or the constraint creation below fails.
    op.drop_constraint("ck_completions_unit_valid", "completions", type_="check")
    op.create_check_constraint(
        "ck_completions_unit_valid",
        "completions",
        f"unit IS NULL OR unit IN ({_NEW_UNITS})",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_completions_unit_valid", "completions", type_="check")
    op.create_check_constraint(
        "ck_completions_unit_valid",
        "completions",
        f"unit IS NULL OR unit IN ({_OLD_UNITS})",
    )
