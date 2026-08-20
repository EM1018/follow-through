"""create commitments table

Revision ID: 06327a74c70a
Revises: c9622c092d4b
Create Date: 2026-08-19 19:12:32.681573

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "06327a74c70a"
down_revision: str | Sequence[str] | None = "c9622c092d4b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INVITE_STATUS_ENUM = sa.Enum("pending", "accepted", "declined", name="invite_status")


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "commitments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("creator_id", sa.Uuid(), nullable=False),
        # NULL = goal, NOT NULL = challenge - the row's kind is derived from
        # this column, on purpose, rather than a separate `kind` field.
        sa.Column("recipient_id", sa.Uuid(), nullable=True),
        sa.Column("activity", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("target_value", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("target_unit", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("sessions_per_week", sa.Integer(), nullable=False),
        sa.Column("duration_weeks", sa.Integer(), nullable=True),
        sa.Column("starts_on", sa.Date(), nullable=True),
        sa.Column("invite_status", _INVITE_STATUS_ENUM, nullable=True),
        # Self-FK, points at the ROOT of a rematch chain - unused until Stage 3.
        sa.Column("rematch_of_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(target_value IS NULL AND target_unit IS NULL) "
            "OR (target_value IS NOT NULL AND target_unit IS NOT NULL)",
            name="ck_commitments_target_both_or_neither",
        ),
        sa.CheckConstraint(
            "target_value IS NULL OR target_value > 0",
            name="ck_commitments_target_value_positive",
        ),
        sa.CheckConstraint(
            "sessions_per_week BETWEEN 1 AND 7",
            name="ck_commitments_sessions_per_week_range",
        ),
        sa.CheckConstraint(
            "duration_weeks IS NULL OR duration_weeks BETWEEN 1 AND 8",
            name="ck_commitments_duration_weeks_range",
        ),
        sa.CheckConstraint(
            "recipient_id IS NOT NULL OR (invite_status IS NULL AND starts_on IS NOT NULL)",
            name="ck_commitments_goal_shape",
        ),
        sa.CheckConstraint(
            "rematch_of_id IS NULL OR rematch_of_id <> id",
            name="ck_commitments_rematch_not_self",
        ),
        # A commitment is a fact its creator authored - deleting the user
        # deletes it outright, unlike completions which only lose their link
        # (schedule_entry_id SET NULL) and are otherwise kept forever.
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rematch_of_id"], ["commitments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_commitments_creator_id"), "commitments", ["creator_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_commitments_creator_id"), table_name="commitments")
    op.drop_table("commitments")
    # create_table's Enum column above created this type as a side effect of
    # the table DDL, but does not drop it as a side effect of drop_table -
    # left behind, it would collide with this same migration's next upgrade.
    _INVITE_STATUS_ENUM.drop(op.get_bind(), checkfirst=False)
