import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKeyConstraint,
    Text,
    UniqueConstraint,
    func,
)
from sqlmodel import Field, SQLModel


class ScheduleEntry(SQLModel, table=True):
    __tablename__ = "schedule_entries"
    __table_args__ = (
        CheckConstraint(
            "(day_of_week IS NOT NULL) <> (on_date IS NOT NULL)",
            name="ck_schedule_entries_day_xor_date",
        ),
        CheckConstraint(
            "day_of_week IS NULL OR (day_of_week BETWEEN 1 AND 7)",
            name="ck_schedule_entries_day_of_week_range",
        ),
        # A row must either say what to do, or say what NOT to do - the third
        # clause is what makes cancellations (replaces_entry_id set, no
        # workout_id, no name_override) representable at all.
        CheckConstraint(
            "workout_id IS NOT NULL OR name_override IS NOT NULL OR replaces_entry_id IS NOT NULL",
            name="ck_schedule_entries_workout_or_override",
        ),
        CheckConstraint(
            "ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on",
            name="ck_schedule_entries_ends_after_starts",
        ),
        # Only dated entries may replace/cancel something - a recurring entry
        # can't stand in for "just this one occurrence".
        CheckConstraint(
            "replaces_entry_id IS NULL OR on_date IS NOT NULL",
            name="ck_schedule_entries_replaces_requires_date",
        ),
        CheckConstraint(
            "replaces_entry_id IS NULL OR replaces_entry_id <> id",
            name="ck_schedule_entries_no_self_replace",
        ),
        # Date bounds (starts_on/ends_on) describe a recurring rule's active
        # window - meaningless on a one-off dated entry.
        CheckConstraint(
            "on_date IS NULL OR (starts_on IS NULL AND ends_on IS NULL)",
            name="ck_schedule_entries_dated_has_no_bounds",
        ),
        # workout_or_override (above) is an OR - it guarantees not-neither, not
        # not-both. Per-occurrence relabelling of a real workout is deferred, so
        # a row can't have both a workout and a standalone name at once. This
        # doesn't affect replacements (workout_id + replaces_entry_id) or
        # name-only replacements (name_override + replaces_entry_id) - only
        # workout_id and name_override are mutually exclusive with each other.
        CheckConstraint(
            "workout_id IS NULL OR name_override IS NULL",
            name="ck_schedule_entries_workout_excludes_override",
        ),
        # Target for the two composite FKs below (self-referencing for
        # replaces_entry_id) - id alone is already globally unique, so this
        # restricts nothing new.
        UniqueConstraint("plan_id", "id", name="uq_schedule_entries_plan_id_id"),
        # Composite, not single-column: a schedule entry can only reference a
        # workout that belongs to *this* entry's own plan, not just any workout
        # that exists somewhere. MATCH SIMPLE (the default) means a NULL
        # workout_id skips this check entirely, so name-only entries are unaffected.
        ForeignKeyConstraint(
            ["plan_id", "workout_id"],
            ["workouts.plan_id", "workouts.id"],
            ondelete="CASCADE",
            name="schedule_entries_workout_id_fkey",
        ),
        # Same reasoning, self-referencing: a replacement/cancellation can only
        # target an entry within its own plan.
        ForeignKeyConstraint(
            ["plan_id", "replaces_entry_id"],
            ["schedule_entries.plan_id", "schedule_entries.id"],
            ondelete="CASCADE",
            name="schedule_entries_replaces_entry_id_fkey",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    plan_id: uuid.UUID = Field(foreign_key="plans.id", ondelete="CASCADE", index=True)
    workout_id: uuid.UUID | None = Field(default=None)
    day_of_week: int | None = Field(default=None)
    on_date: date | None = Field(default=None)
    replaces_entry_id: uuid.UUID | None = Field(default=None)
    starts_on: date | None = Field(default=None)
    ends_on: date | None = Field(default=None)
    name_override: str | None = Field(default=None, max_length=100)
    notes_override: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
