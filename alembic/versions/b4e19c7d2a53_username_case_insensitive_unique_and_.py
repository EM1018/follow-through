"""username case-insensitive unique index and commitment ended_by_id

Revision ID: b4e19c7d2a53
Revises: 964556b89ff0
Create Date: 2026-10-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4e19c7d2a53"
down_revision: str | Sequence[str] | None = "964556b89ff0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nothing reads or writes this yet - it is here so Stage 3 (challenges)
    # needs no migration of its own. ended_on says a commitment ended but not
    # who ended it, which only stops being obvious once either participant
    # can quit.
    op.add_column(
        "commitments",
        sa.Column(
            "ended_by_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Usernames are now stored as typed and compared without case, so the
    # format check has to let uppercase in.
    op.drop_constraint("ck_users_username_format", "users", type_="check")
    op.create_check_constraint(
        "ck_users_username_format",
        "users",
        "username IS NULL OR username ~ '^[A-Za-z0-9_]{3,20}$'",
    )

    # An index, not a constraint - Postgres only allows UNIQUE constraints over
    # plain columns, not expressions. NULLs are distinct in a unique index, so
    # rows without a username never collide and no partial WHERE is needed.
    # Created before the old index is dropped (and inside the same migration
    # transaction) so there is never a moment with no uniqueness at all.
    op.create_index(
        "uq_users_username_lower",
        "users",
        [sa.text("lower(username)")],
        unique=True,
    )
    op.drop_index("ix_users_username", table_name="users")


def downgrade() -> None:
    """Downgrade schema.

    Fails if any username contains uppercase by the time this runs - the
    lowercase-only check cannot be restored over rows that violate it, and
    lowercasing them here would silently rewrite what users chose.
    """
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.drop_index("uq_users_username_lower", table_name="users")
    op.drop_constraint("ck_users_username_format", "users", type_="check")
    op.create_check_constraint(
        "ck_users_username_format",
        "users",
        "username IS NULL OR username ~ '^[a-z0-9_]{3,20}$'",
    )
    op.drop_column("commitments", "ended_by_id")
