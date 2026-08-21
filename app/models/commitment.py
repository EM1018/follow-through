import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, Column, DateTime, Enum, Integer, Numeric, func
from sqlmodel import Field, SQLModel


class InviteStatus(StrEnum):
    """Challenge-only - stays NULL for every goal (see ck_commitments_goal_shape).
    Nothing writes this until Stage 3 wires up the invite flow; the column and
    its native Postgres enum type exist now so that stage needs no migration
    of its own.
    """

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class Commitment(SQLModel, table=True):
    __tablename__ = "commitments"
    __table_args__ = (
        CheckConstraint(
            "(target_value IS NULL AND target_unit IS NULL) "
            "OR (target_value IS NOT NULL AND target_unit IS NOT NULL)",
            name="ck_commitments_target_both_or_neither",
        ),
        CheckConstraint(
            "target_value IS NULL OR target_value > 0",
            name="ck_commitments_target_value_positive",
        ),
        CheckConstraint(
            "sessions_per_week BETWEEN 1 AND 7",
            name="ck_commitments_sessions_per_week_range",
        ),
        CheckConstraint(
            "duration_weeks IS NULL OR duration_weeks BETWEEN 1 AND 8",
            name="ck_commitments_duration_weeks_range",
        ),
        # goal-vs-challenge is derived from recipient_id, not a stored `kind` -
        # a goal (recipient_id NULL) must always have a starts_on and never an
        # invite_status; a challenge's shape is unconstrained here (Stage 3).
        CheckConstraint(
            "recipient_id IS NOT NULL OR (invite_status IS NULL AND starts_on IS NOT NULL)",
            name="ck_commitments_goal_shape",
        ),
        CheckConstraint(
            "rematch_of_id IS NULL OR rematch_of_id <> id",
            name="ck_commitments_rematch_not_self",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    creator_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    recipient_id: uuid.UUID | None = Field(
        default=None, foreign_key="users.id", ondelete="CASCADE"
    )
    activity: str
    target_value: Decimal | None = Field(
        default=None, sa_column=Column(Numeric(6, 2), nullable=True)
    )
    target_unit: str | None = Field(default=None)
    sessions_per_week: int = Field(sa_column=Column(Integer, nullable=False))
    duration_weeks: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    starts_on: date | None = Field(default=None)
    invite_status: InviteStatus | None = Field(
        default=None,
        sa_column=Column(
            # values_callable: store the StrEnum's lowercase .value ("pending"),
            # not its default .name ("PENDING") - the latter wouldn't match any
            # label in the invite_status type this migration actually created.
            Enum(
                InviteStatus,
                name="invite_status",
                native_enum=True,
                values_callable=lambda enum_cls: [member.value for member in enum_cls],
            ),
            nullable=True,
        ),
    )
    rematch_of_id: uuid.UUID | None = Field(
        default=None, foreign_key="commitments.id", ondelete="SET NULL"
    )
    # NULL = not ended early. Deliberately doesn't touch duration_weeks - an
    # ongoing goal that was stopped still says Ongoing in its terms, with this
    # as a separate fact recording when it stopped.
    ended_on: date | None = Field(default=None)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
