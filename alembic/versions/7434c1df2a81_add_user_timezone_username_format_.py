"""add user timezone, username format check, and commitment ended_on

Revision ID: 7434c1df2a81
Revises: 06327a74c70a
Create Date: 2026-08-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7434c1df2a81"
down_revision: str | Sequence[str] | None = "06327a74c70a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # server_default backfills every existing row to 'UTC' as part of the same
    # statement - nothing here can end up with a missing timezone.
    op.add_column(
        "users",
        sa.Column(
            "timezone",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default="UTC",
        ),
    )
    op.create_check_constraint(
        "ck_users_username_format",
        "users",
        "username IS NULL OR username ~ '^[a-z0-9_]{3,20}$'",
    )
    op.add_column("commitments", sa.Column("ended_on", sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("commitments", "ended_on")
    op.drop_constraint("ck_users_username_format", "users", type_="check")
    op.drop_column("users", "timezone")
