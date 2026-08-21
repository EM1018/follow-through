import re
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

_USERNAME_PATTERN = re.compile(r"^[a-z0-9_]{3,20}$")


class MeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str | None
    email: str
    timezone: str
    created_at: datetime


class MeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str | None = None
    timezone: str | None = None

    @field_validator("username")
    @classmethod
    def _normalize_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        # Lowercased before anything else - "Jordan_R" and "jordan_r" are the
        # same name, and the format pattern itself is lowercase-only.
        value = value.lower()
        if not _USERNAME_PATTERN.match(value):
            raise ValueError("username must be 3-20 lowercase letters, digits, or underscores")
        return value

    @field_validator("timezone")
    @classmethod
    def _validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        # Constructing ZoneInfo is the validation - no hardcoded list to
        # maintain or fall out of date with the IANA database.
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"unknown timezone: {value!r}") from exc
        return value

    @model_validator(mode="after")
    def _require_at_least_one_field(self) -> "MeUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one of username or timezone must be provided")
        return self
