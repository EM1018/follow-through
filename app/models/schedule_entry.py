import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Column, DateTime, Text, func
from sqlmodel import Field, SQLModel


class ScheduleEntry(SQLModel, table=True):
    __tablename__ = "schedule_entries"
    __table_args__ = (
        # Stage A only ever sets day_of_week + workout_id, so these first two
        # constraints are unreachable until Stage B creates on_date/name_override
        # rows - they exist now so Stage B inherits a schema that already refuses
        # nonsensical rows, rather than needing a follow-up migration to add them.
        CheckConstraint(
            "(day_of_week IS NOT NULL) <> (on_date IS NOT NULL)",
            name="ck_schedule_entries_day_xor_date",
        ),
        CheckConstraint(
            "day_of_week IS NULL OR (day_of_week BETWEEN 1 AND 7)",
            name="ck_schedule_entries_day_of_week_range",
        ),
        CheckConstraint(
            "workout_id IS NOT NULL OR name_override IS NOT NULL",
            name="ck_schedule_entries_workout_or_override",
        ),
        CheckConstraint(
            "ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on",
            name="ck_schedule_entries_ends_after_starts",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    plan_id: uuid.UUID = Field(foreign_key="plans.id", ondelete="CASCADE", index=True)
    workout_id: uuid.UUID | None = Field(
        default=None, foreign_key="workouts.id", ondelete="CASCADE"
    )
    day_of_week: int | None = Field(default=None)
    on_date: date | None = Field(default=None)  # Stage B
    replaces_entry_id: uuid.UUID | None = Field(
        default=None, foreign_key="schedule_entries.id"
    )  # Stage B
    starts_on: date | None = Field(default=None)
    ends_on: date | None = Field(default=None)
    name_override: str | None = Field(default=None, max_length=100)  # Stage B
    notes_override: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
