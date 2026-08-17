import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Index,
    Numeric,
    Text,
    func,
)
from sqlalchemy import text as satext
from sqlmodel import Field, SQLModel

from app.services.activities import Activity, Unit

_ACTIVITY_VALUES = ", ".join(f"'{a.value}'" for a in Activity)
_UNIT_VALUES = ", ".join(f"'{u.value}'" for u in Unit)


class Completion(SQLModel, table=True):
    __tablename__ = "completions"
    __table_args__ = (
        CheckConstraint(
            "(value IS NULL AND unit IS NULL) OR (value IS NOT NULL AND unit IS NOT NULL)",
            name="ck_completions_value_unit_paired",
        ),
        CheckConstraint(
            "value IS NULL OR value > 0",
            name="ck_completions_value_positive",
        ),
        CheckConstraint(
            f"activity IS NULL OR activity IN ({_ACTIVITY_VALUES})",
            name="ck_completions_activity_valid",
        ),
        CheckConstraint(
            f"unit IS NULL OR unit IN ({_UNIT_VALUES})",
            name="ck_completions_unit_valid",
        ),
        # Partial: many rows can share on_date once schedule_entry_id has been
        # nulled out by ON DELETE SET NULL, so the uniqueness only holds while
        # a completion is still linked to a real schedule entry.
        Index(
            "uq_completions_entry_date",
            "schedule_entry_id",
            "on_date",
            unique=True,
            postgresql_where=satext("schedule_entry_id IS NOT NULL"),
        ),
        Index("ix_completions_user_date", "user_id", satext("on_date DESC")),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE")
    activity: str | None = Field(default=None)
    value: Decimal | None = Field(default=None, sa_column=Column(Numeric(8, 2), nullable=True))
    unit: str | None = Field(default=None)
    on_date: date
    schedule_entry_id: uuid.UUID | None = Field(
        default=None, foreign_key="schedule_entries.id", ondelete="SET NULL"
    )
    label: str = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
