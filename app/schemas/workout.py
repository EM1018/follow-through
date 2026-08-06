import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WorkoutCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    notes: str | None = None


class WorkoutUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=100)
    notes: str | None = None


class WorkoutRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_id: uuid.UUID
    name: str
    notes: str | None
    created_at: datetime
