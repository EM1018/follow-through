"""one live replacement per kind per day

Revision ID: 964556b89ff0
Revises: 7434c1df2a81
Create Date: 2026-08-25 18:02:40.353179

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "964556b89ff0"
down_revision: str | Sequence[str] | None = "7434c1df2a81"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Dedupe per (replaces_entry_id, on_date, kind) before the index below can
    # be created - kind is the same null-test on workout_id/name_override
    # that is_cancellation() uses, so a cancellation and a replacement
    # targeting the same root on the same date are two different groups and
    # both survive untouched. Within a group, keep the newest row
    # (created_at DESC) and drop the rest. A deleted row's completion (if any)
    # survives standalone via ON DELETE SET NULL - intentional, not guarded
    # against here.
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY
                        replaces_entry_id,
                        on_date,
                        (workout_id IS NULL AND name_override IS NULL)
                    ORDER BY created_at DESC
                ) AS rn
            FROM schedule_entries
            WHERE replaces_entry_id IS NOT NULL
        )
        DELETE FROM schedule_entries
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )

    # Two partial unique indexes, not one - a cancellation
    # (workout_id/name_override both null) and a replacement (either set)
    # targeting the same root on the same date is a legitimate, load-bearing
    # state (see the comment above is_cancellation() in
    # app/services/resolution.py), so the two kinds must not collide with
    # each other, only with themselves.
    op.create_index(
        "uq_schedule_entries_one_cancellation_per_day",
        "schedule_entries",
        ["replaces_entry_id", "on_date"],
        unique=True,
        postgresql_where=sa.text(
            "replaces_entry_id IS NOT NULL AND workout_id IS NULL AND name_override IS NULL"
        ),
    )
    op.create_index(
        "uq_schedule_entries_one_replacement_per_day",
        "schedule_entries",
        ["replaces_entry_id", "on_date"],
        unique=True,
        postgresql_where=sa.text(
            "replaces_entry_id IS NOT NULL"
            " AND (workout_id IS NOT NULL OR name_override IS NOT NULL)"
        ),
    )


def downgrade() -> None:
    """Downgrade schema.

    Drops the two indexes only. Rows deleted by upgrade()'s dedupe are not
    recoverable - this downgrade is not a true inverse of upgrade().
    """
    op.drop_index("uq_schedule_entries_one_replacement_per_day", table_name="schedule_entries")
    op.drop_index("uq_schedule_entries_one_cancellation_per_day", table_name="schedule_entries")
