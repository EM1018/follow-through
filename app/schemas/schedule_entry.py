import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _check_ends_on(starts_on: date | None, ends_on: date | None) -> None:
    if starts_on is not None and ends_on is not None and ends_on < starts_on:
        raise ValueError("ends_on must be on or after starts_on")


class ScheduleEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workout_id: uuid.UUID
    day_of_week: int = Field(ge=1, le=7)
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _validate_dates(self) -> "ScheduleEntryCreate":
        _check_ends_on(self.starts_on, self.ends_on)
        return self


class ScheduleEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workout_id: uuid.UUID | None = None
    day_of_week: int | None = Field(default=None, ge=1, le=7)
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _validate_dates(self) -> "ScheduleEntryUpdate":
        # only catches the case where both fields are in *this* payload; a PATCH
        # that changes just one of them is validated against the existing row
        # in the router instead, since this schema can't see the current DB state
        _check_ends_on(self.starts_on, self.ends_on)
        return self


class ScheduleEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    workout_id: uuid.UUID | None
    day_of_week: int | None
    starts_on: date | None
    ends_on: date | None
    created_at: datetime
