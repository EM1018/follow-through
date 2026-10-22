import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    model_serializer,
    model_validator,
)

from app.services.activities import ACTIVITY_UNITS, Activity, Unit
from app.services.commitments import CommitmentStatus


class CommitmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    activity: Activity
    target_value: Decimal | None = Field(default=None, gt=0)
    target_unit: Unit | None = None
    sessions_per_week: int = Field(ge=1, le=7)
    duration_weeks: int | None = Field(default=None, ge=1, le=8)
    # Present -> challenge, absent -> goal. A username rather than an id: the
    # sender types who they're challenging, and the server resolves it.
    recipient_username: str | None = None

    @model_validator(mode="after")
    def _validate(self) -> "CommitmentCreate":
        if (self.target_value is None) != (self.target_unit is None):
            raise ValueError("target_value and target_unit must be set together")

        if (
            self.target_unit is not None
            and self.target_unit not in ACTIVITY_UNITS[self.activity].permitted
        ):
            raise ValueError(f"{self.target_unit} is not a valid unit for {self.activity}")

        return self


class CommitmentsListResponse(BaseModel):
    active: list["OrientedCommitmentRead"]
    finished: list["OrientedCommitmentRead"]


# The oriented read. Everything below describes a commitment as one particular
# person sees it - "you" and "them", not creator and recipient - and is built
# field by field from values the server chose to send. None of these models
# reads from an ORM object (no from_attributes), so a column added to a table
# later can't appear in a response until someone names it here.


class _OmitsWhatDoesNotApply(BaseModel):
    """A field that was never given a value is left out of the JSON, rather
    than sent as null.

    Absent and empty say different things: an empty track is "we looked and
    found nothing", a missing one is "there is nothing to look at". Doing
    this on the model, not with a flag on each route, means a new endpoint
    can't forget it. A field explicitly set to None is still sent as null -
    that's how an Ongoing goal's duration_weeks stays in the response.
    """

    # No return annotation, deliberately: pydantic would take one as the
    # shape of the output and the OpenAPI schema for every subclass would
    # collapse to a bare object. Without it the schema stays the model's own.
    @model_serializer(mode="wrap")
    def _omit_unset(self, handler: SerializerFunctionWrapHandler):  # type: ignore[no-untyped-def]
        serialized: dict[str, Any] = handler(self)
        return {name: value for name, value in serialized.items() if name in self.model_fields_set}


class WeekRead(BaseModel):
    """One week of one person's track: how many sessions counted, and how the
    week stands. This is all of someone's training that ever leaves the
    server - never the completions behind the count (their dates, amounts,
    notes, or ids).
    """

    # Which week of the commitment, from 0. Its dates follow from starts_on.
    index: int
    sessions_done: int
    met: bool
    # The week containing today, not yet met - still winnable, so not a miss.
    # False with met False is a week that closed short.
    in_progress: bool


class TrackRead(BaseModel):
    # Only weeks that have been reached, oldest first. A week still to come
    # isn't listed at all - weeks_total is what says it exists - so "hasn't
    # happened yet" can never be drawn as "missed".
    weeks: list[WeekRead]
    weeks_total: int
    weeks_passed: int
    current_streak: int
    longest_streak: int


class ThemRead(_OmitsWhatDoesNotApply):
    """The other participant in a challenge."""

    # Read from their user row at request time, never stored on the
    # commitment - if they rename themselves, every card follows.
    username: str | None
    # Absent until the challenge has started.
    track: TrackRead | None = None


class EndedBy(StrEnum):
    YOU = "you"
    THEM = "them"


class OrientedCommitmentRead(_OmitsWhatDoesNotApply):
    """A goal or a challenge, as the caller sees it. One shape for both: a
    goal is the one with no `them`.
    """

    id: uuid.UUID
    status: CommitmentStatus
    activity: Activity
    target_value: float | None
    target_unit: Unit | None
    sessions_per_week: int
    # null is a real value here: an Ongoing goal.
    duration_weeks: int | None
    created_at: datetime
    # Everything below is left out, not sent empty, when it doesn't apply.
    # Absent until the clock has started (a goal's starts at creation, a
    # challenge's at accept).
    starts_on: date | None = None
    # The caller's own track. Absent until the clock has started.
    you: TrackRead | None = None
    # Absent on a goal - that absence is what makes it one.
    them: ThemRead | None = None
    # Both only when status is ended_early: the day it was ended, and by whom.
    ended_on: date | None = None
    ended_by: EndedBy | None = None


CommitmentsListResponse.model_rebuild()
