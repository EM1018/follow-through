import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.commitment import InviteStatus
from app.services.activities import ACTIVITY_UNITS, Activity, Unit
from app.services.commitments import BlockStatus


class CommitmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity: Activity
    target_value: Decimal | None = Field(default=None, gt=0)
    target_unit: Unit | None = None
    sessions_per_week: int = Field(ge=1, le=7)
    duration_weeks: int | None = Field(default=None, ge=1, le=8)

    @model_validator(mode="after")
    def _validate(self) -> "CommitmentCreate":
        if (self.target_value is None) != (self.target_unit is None):
            raise ValueError("target_value and target_unit must be set together")

        if self.target_unit is not None and self.target_unit not in ACTIVITY_UNITS[
            self.activity
        ].permitted:
            raise ValueError(f"{self.target_unit} is not a valid unit for {self.activity}")

        return self


class BlockRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    index: int
    starts_on: date
    ends_on: date
    sessions_done: int
    sessions_required: int
    status: BlockStatus


class ProgressRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    blocks: list[BlockRead]
    current_streak: int
    longest_streak: int
    weeks_passed: int
    weeks_total: int


class CommitmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    creator_id: uuid.UUID
    recipient_id: uuid.UUID | None
    activity: Activity
    # float, not Decimal, on the way out - same reasoning as CompletionRead.value:
    # exact precision is only needed for the >= comparison inside compute_progress.
    target_value: float | None
    target_unit: Unit | None
    sessions_per_week: int
    duration_weeks: int | None
    starts_on: date | None
    invite_status: InviteStatus | None
    rematch_of_id: uuid.UUID | None
    created_at: datetime
    progress: ProgressRead


class CommitmentsListResponse(BaseModel):
    active: list[CommitmentRead]
    finished: list[CommitmentRead]
