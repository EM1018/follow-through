import uuid
from datetime import UTC, date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _today() -> date:
    return datetime.now(UTC).date()


def _check_ends_on(starts_on: date | None, ends_on: date | None) -> None:
    if starts_on is not None and ends_on is not None and ends_on < starts_on:
        raise ValueError("ends_on must be on or after starts_on")


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    is_active: bool = True
    starts_on: date
    ends_on: date | None = None
    visible_to_friends: bool = False

    @model_validator(mode="after")
    def _validate_dates(self) -> "PlanCreate":
        _check_ends_on(self.starts_on, self.ends_on)
        if self.starts_on < _today():
            raise ValueError("starts_on cannot be in the past")
        return self


class PlanUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_active: bool | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    visible_to_friends: bool | None = None

    @model_validator(mode="after")
    def _validate_dates(self) -> "PlanUpdate":
        # only catches the case where both fields are in *this* payload; a PATCH
        # that changes just one of them is validated against the existing row
        # in the router instead, since this schema can't see the current DB state
        _check_ends_on(self.starts_on, self.ends_on)
        # starts_on being None here means "not part of this PATCH" (the field is
        # non-nullable on the table, so None can never mean "clear it") - only
        # validate when a new value is actually being set
        if self.starts_on is not None and self.starts_on < _today():
            raise ValueError("starts_on cannot be in the past")
        return self


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    is_active: bool
    starts_on: date
    ends_on: date | None
    visible_to_friends: bool
    created_at: datetime
