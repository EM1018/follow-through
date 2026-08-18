"""add completions source column

Revision ID: 837904deac92
Revises: 6d813f4d0c67
Create Date: 2026-08-17 17:02:06.747822

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "837904deac92"
down_revision: str | Sequence[str] | None = "6d813f4d0c67"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable first - adding NOT NULL directly fails on a non-empty table.
    # Backfilled from schedule_entry_id, then locked down: that column is
    # still a faithful signal today (no schedule entry has ever been deleted
    # in dev), but stops being trustworthy the moment one is - which is the
    # whole reason source exists as its own never-updated snapshot.
    op.add_column(
        "completions", sa.Column("source", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
    )
    op.execute(
        """
        UPDATE completions
        SET source = CASE
          WHEN schedule_entry_id IS NOT NULL THEN 'scheduled'
          ELSE 'standalone'
        END
        """
    )
    op.alter_column("completions", "source", nullable=False)
    op.create_check_constraint(
        "ck_completions_source_valid",
        "completions",
        "source IN ('scheduled', 'standalone')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_completions_source_valid", "completions", type_="check")
    op.drop_column("completions", "source")
