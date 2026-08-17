import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, Text, UniqueConstraint, func
from sqlmodel import Field, SQLModel

from app.services.activities import Activity

_ACTIVITY_VALUES = ", ".join(f"'{a.value}'" for a in Activity)


class Workout(SQLModel, table=True):
    __tablename__ = "workouts"
    __table_args__ = (
        # Target for schedule_entries' composite (plan_id, workout_id) FK, so a
        # schedule entry can only ever reference a workout from its own plan -
        # id alone is already globally unique, so this restricts nothing new.
        UniqueConstraint("plan_id", "id", name="uq_workouts_plan_id_id"),
        CheckConstraint(
            f"activity IS NULL OR activity IN ({_ACTIVITY_VALUES})",
            name="ck_workouts_activity_valid",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    plan_id: uuid.UUID = Field(foreign_key="plans.id", ondelete="CASCADE", index=True)
    name: str = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    # Nullable and not yet exposed on any schema (deferred to 1b) - lets a
    # workout be tagged as e.g. strength_training so ticking it off can count
    # toward a matching goal. Purely additive: existing rows get NULL.
    activity: str | None = Field(default=None)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
