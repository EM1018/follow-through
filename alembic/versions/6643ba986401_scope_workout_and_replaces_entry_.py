"""scope workout and replaces entry references to the same plan

Revision ID: 6643ba986401
Revises: aab8a204fe22
Create Date: 2026-08-11 12:53:54.638920

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6643ba986401"
down_revision: str | Sequence[str] | None = "aab8a204fe22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Targets for the composite FKs below - id alone is already globally
    # unique, so these restrict nothing new, they just give Postgres something
    # two-column-wide to point at.
    op.create_unique_constraint("uq_workouts_plan_id_id", "workouts", ["plan_id", "id"])
    op.create_unique_constraint(
        "uq_schedule_entries_plan_id_id", "schedule_entries", ["plan_id", "id"]
    )

    # Was single-column (workout_id -> workouts.id): confirmed the workout row
    # existed somewhere, not that it belonged to this entry's own plan.
    op.drop_constraint("schedule_entries_workout_id_fkey", "schedule_entries", type_="foreignkey")
    op.create_foreign_key(
        "schedule_entries_workout_id_fkey",
        "schedule_entries",
        "workouts",
        ["plan_id", "workout_id"],
        ["plan_id", "id"],
        ondelete="CASCADE",
    )

    # Same fix, self-referencing: replaces_entry_id could previously point at
    # an entry in a different plan (even a different user's).
    op.drop_constraint(
        "schedule_entries_replaces_entry_id_fkey", "schedule_entries", type_="foreignkey"
    )
    op.create_foreign_key(
        "schedule_entries_replaces_entry_id_fkey",
        "schedule_entries",
        "schedule_entries",
        ["plan_id", "replaces_entry_id"],
        ["plan_id", "id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "schedule_entries_replaces_entry_id_fkey", "schedule_entries", type_="foreignkey"
    )
    op.create_foreign_key(
        "schedule_entries_replaces_entry_id_fkey",
        "schedule_entries",
        "schedule_entries",
        ["replaces_entry_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("schedule_entries_workout_id_fkey", "schedule_entries", type_="foreignkey")
    op.create_foreign_key(
        "schedule_entries_workout_id_fkey",
        "schedule_entries",
        "workouts",
        ["workout_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("uq_schedule_entries_plan_id_id", "schedule_entries", type_="unique")
    op.drop_constraint("uq_workouts_plan_id_id", "workouts", type_="unique")
