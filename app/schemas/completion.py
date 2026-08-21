import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.completion import CompletionSource
from app.services.activities import ACTIVITY_UNITS, Activity, Unit


class CompletionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity: Activity | None = None
    value: Decimal | None = Field(default=None, gt=0)
    unit: Unit | None = None
    on_date: date
    schedule_entry_id: uuid.UUID | None = None
    note: str | None = None

    @model_validator(mode="after")
    def _validate(self) -> "CompletionCreate":
        if (self.value is None) != (self.unit is None):
            raise ValueError("value and unit must be set together")

        # The future-date check needs the caller's timezone (users.timezone),
        # which this schema has no access to - it lives in the router
        # (create_completion), against user_today(), instead.

        # No permitted set to check against when activity is null - a workout
        # with no activity can still record an amount, it just satisfies no goal.
        if (
            self.activity is not None
            and self.unit is not None
            and self.unit not in ACTIVITY_UNITS[self.activity].permitted
        ):
            raise ValueError(f"{self.unit} is not a valid unit for {self.activity}")

        # Without either one there's nothing to derive a label from.
        if self.activity is None and self.schedule_entry_id is None:
            raise ValueError("activity is required when schedule_entry_id is not set")

        return self


class CompletionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity: Activity | None = None
    value: Decimal | None = Field(default=None, gt=0)
    unit: Unit | None = None
    note: str | None = None

    @model_validator(mode="after")
    def _validate(self) -> "CompletionUpdate":
        # Presence in the payload, not None-ness - {"value": null, "unit": null}
        # (clearing the amount) must pass, but {"value": null} alone must not,
        # since that would leave a stranded unit and violate the paired CHECK.
        fields = self.model_fields_set
        if ("value" in fields) != ("unit" in fields):
            raise ValueError("value and unit must be set together")
        return self


class CompletionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    activity: Activity | None
    # float, not Decimal, on the way out - the exact-precision guarantee is
    # only needed for the >= target comparison that runs server-side against
    # the Numeric(8,2) column; the client just displays and counts rows.
    value: float | None
    unit: Unit | None
    on_date: date
    schedule_entry_id: uuid.UUID | None
    source: CompletionSource
    label: str
    note: str | None
    created_at: datetime
