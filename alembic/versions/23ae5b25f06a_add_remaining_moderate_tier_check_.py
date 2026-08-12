"""add remaining moderate tier check constraints

Revision ID: 23ae5b25f06a
Revises: 6643ba986401
Create Date: 2026-08-11 13:11:48.473011

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "23ae5b25f06a"
down_revision: str | Sequence[str] | None = "6643ba986401"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # ck_schedule_entries_workout_or_override is an OR - it guarantees not-neither,
    # not not-both. The app already forbids workout_id + name_override together;
    # this makes it a DB-level guarantee too.
    op.create_check_constraint(
        "ck_schedule_entries_workout_excludes_override",
        "schedule_entries",
        "workout_id IS NULL OR name_override IS NULL",
    )
    # ScheduleEntry already had this backstop; Plan never did.
    op.create_check_constraint(
        "ck_plans_ends_after_starts", "plans", "ends_on IS NULL OR ends_on >= starts_on"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_plans_ends_after_starts", "plans", type_="check")
    op.drop_constraint(
        "ck_schedule_entries_workout_excludes_override", "schedule_entries", type_="check"
    )
