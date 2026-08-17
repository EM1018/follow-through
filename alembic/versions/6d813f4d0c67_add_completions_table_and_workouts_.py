"""add completions table and workouts activity column

Revision ID: 6d813f4d0c67
Revises: 23ae5b25f06a
Create Date: 2026-08-16 23:20:44.819417

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6d813f4d0c67"
down_revision: str | Sequence[str] | None = "23ae5b25f06a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "completions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("activity", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("value", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("unit", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("on_date", sa.Date(), nullable=False),
        sa.Column("schedule_entry_id", sa.Uuid(), nullable=True),
        sa.Column("label", sqlmodel.sql.sqltypes.AutoString(length=200), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(value IS NULL AND unit IS NULL) OR (value IS NOT NULL AND unit IS NOT NULL)",
            name="ck_completions_value_unit_paired",
        ),
        sa.CheckConstraint(
            "value IS NULL OR value > 0",
            name="ck_completions_value_positive",
        ),
        sa.CheckConstraint(
            "activity IS NULL OR activity IN "
            "('running', 'walking', 'cycling', 'swimming', 'strength_training', "
            "'cardio', 'stretching_mobility', 'other')",
            name="ck_completions_activity_valid",
        ),
        sa.CheckConstraint(
            "unit IS NULL OR unit IN "
            "('minutes', 'hours', 'miles', 'kilometers', 'sessions', 'sets', 'reps')",
            name="ck_completions_unit_valid",
        ),
        # user_id cascades (a completion is a fact about the user); schedule_entry_id
        # does not - deleting a plan/workout must never delete logged history.
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["schedule_entry_id"], ["schedule_entries.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    # Partial: many rows can share on_date once schedule_entry_id has been
    # nulled out by ON DELETE SET NULL, so uniqueness only holds while a
    # completion is still linked to a real schedule entry.
    op.create_index(
        "uq_completions_entry_date",
        "completions",
        ["schedule_entry_id", "on_date"],
        unique=True,
        postgresql_where=sa.text("schedule_entry_id IS NOT NULL"),
    )
    op.create_index(
        "ix_completions_user_date",
        "completions",
        ["user_id", sa.literal_column("on_date DESC")],
        unique=False,
    )

    # Nullable and additive - existing workouts get NULL, nothing behaves
    # differently until 1b exposes this on a schema.
    op.add_column(
        "workouts", sa.Column("activity", sqlmodel.sql.sqltypes.AutoString(), nullable=True)
    )
    op.create_check_constraint(
        "ck_workouts_activity_valid",
        "workouts",
        "activity IS NULL OR activity IN "
        "('running', 'walking', 'cycling', 'swimming', 'strength_training', "
        "'cardio', 'stretching_mobility', 'other')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_workouts_activity_valid", "workouts", type_="check")
    op.drop_column("workouts", "activity")

    op.drop_index("ix_completions_user_date", table_name="completions")
    op.drop_index(
        "uq_completions_entry_date",
        table_name="completions",
        postgresql_where=sa.text("schedule_entry_id IS NOT NULL"),
    )
    op.drop_table("completions")
