"""stage b dated entries replacements and cancellations

Revision ID: aab8a204fe22
Revises: dc11283b4452
Create Date: 2026-08-06 22:21:48.416294

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aab8a204fe22"
down_revision: str | Sequence[str] | None = "dc11283b4452"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Relax: a row must either say what to do, or say what NOT to do -
    # replaces_entry_id alone (a cancellation) now satisfies this too.
    op.drop_constraint("ck_schedule_entries_workout_or_override", "schedule_entries", type_="check")
    op.create_check_constraint(
        "ck_schedule_entries_workout_or_override",
        "schedule_entries",
        "workout_id IS NOT NULL OR name_override IS NOT NULL OR replaces_entry_id IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_schedule_entries_replaces_requires_date",
        "schedule_entries",
        "replaces_entry_id IS NULL OR on_date IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_schedule_entries_no_self_replace",
        "schedule_entries",
        "replaces_entry_id IS NULL OR replaces_entry_id <> id",
    )
    op.create_check_constraint(
        "ck_schedule_entries_dated_has_no_bounds",
        "schedule_entries",
        "on_date IS NULL OR (starts_on IS NULL AND ends_on IS NULL)",
    )
    # Was NO ACTION (unnamed, Postgres auto-named it schedule_entries_replaces_entry_id_fkey) -
    # deleting a replaced/cancelled target raised ForeignKeyViolation instead of cascading.
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
    )
    op.drop_constraint("ck_schedule_entries_dated_has_no_bounds", "schedule_entries", type_="check")
    op.drop_constraint("ck_schedule_entries_no_self_replace", "schedule_entries", type_="check")
    op.drop_constraint(
        "ck_schedule_entries_replaces_requires_date", "schedule_entries", type_="check"
    )
    op.drop_constraint("ck_schedule_entries_workout_or_override", "schedule_entries", type_="check")
    op.create_check_constraint(
        "ck_schedule_entries_workout_or_override",
        "schedule_entries",
        "workout_id IS NOT NULL OR name_override IS NOT NULL",
    )
