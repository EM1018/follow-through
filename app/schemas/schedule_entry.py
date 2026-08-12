import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _check_ends_on(starts_on: date | None, ends_on: date | None) -> None:
    if starts_on is not None and ends_on is not None and ends_on < starts_on:
        raise ValueError("ends_on must be on or after starts_on")


class ScheduleEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workout_id: uuid.UUID | None = None
    day_of_week: int | None = Field(default=None, ge=1, le=7)
    on_date: date | None = None
    replaces_entry_id: uuid.UUID | None = None
    name_override: str | None = Field(default=None, min_length=1, max_length=100)
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _validate(self) -> "ScheduleEntryCreate":
        has_day = self.day_of_week is not None
        has_date = self.on_date is not None
        if has_day == has_date:
            raise ValueError("exactly one of day_of_week or on_date must be set")

        if has_date and (self.starts_on is not None or self.ends_on is not None):
            raise ValueError("starts_on/ends_on cannot be set together with on_date")

        if self.replaces_entry_id is not None and has_day:
            raise ValueError("replaces_entry_id cannot be set together with day_of_week")

        if (
            self.workout_id is None
            and self.name_override is None
            and self.replaces_entry_id is None
        ):
            raise ValueError(
                "at least one of workout_id, name_override, or replaces_entry_id is required"
            )

        # name_override exists only to name an entry that has no workout in this
        # stage - per-occurrence relabelling of a real workout is deferred.
        if self.name_override is not None and self.workout_id is not None:
            raise ValueError("name_override cannot be set together with workout_id")

        _check_ends_on(self.starts_on, self.ends_on)
        return self


class ScheduleEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workout_id: uuid.UUID | None = None
    day_of_week: int | None = Field(default=None, ge=1, le=7)
    on_date: date | None = None
    replaces_entry_id: uuid.UUID | None = None
    name_override: str | None = Field(default=None, min_length=1, max_length=100)
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _validate(self) -> "ScheduleEntryUpdate":
        # These only catch combinations present in *this* payload - model_fields_set,
        # not attribute truthiness, because an omitted field and an explicit null both
        # read as None on the instance. Whether a single field conflicts with the
        # *existing* row (e.g. day_of_week on an entry that's currently dated) can't be
        # known here at all; that's the router's job, against the merged row.
        fields = self.model_fields_set

        if "day_of_week" in fields and "on_date" in fields:
            raise ValueError("day_of_week and on_date cannot both be set in the same request")

        if "on_date" in fields and ("starts_on" in fields or "ends_on" in fields):
            raise ValueError("starts_on/ends_on cannot be set together with on_date")

        if "replaces_entry_id" in fields and "day_of_week" in fields:
            raise ValueError("replaces_entry_id cannot be set together with day_of_week")

        if "name_override" in fields and "workout_id" in fields:
            raise ValueError("name_override cannot be set together with workout_id")

        _check_ends_on(self.starts_on, self.ends_on)
        return self


class ScheduleEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    workout_id: uuid.UUID | None
    day_of_week: int | None
    on_date: date | None
    replaces_entry_id: uuid.UUID | None
    name_override: str | None
    starts_on: date | None
    ends_on: date | None
    created_at: datetime
