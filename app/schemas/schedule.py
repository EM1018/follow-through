import uuid

from pydantic import BaseModel, ConfigDict

from app.services.resolution import DayStatus, EntryStatus


class EntryRefRead(BaseModel):
    """Minimal reference to another entry - used both for what a substitution
    replaced and what a cancellation cancelled, since both need exactly the
    same information: which entry, and what to call it. Never None.entry_id;
    the whole reference is Optional at the call site instead, for the cases
    where there is nothing to reference at all.
    """

    model_config = ConfigDict(from_attributes=True)

    entry_id: uuid.UUID
    name: str | None


class ResolvedEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entry_id: uuid.UUID
    workout_id: uuid.UUID | None
    name: str | None
    notes: str | None
    status: EntryStatus
    replaced: EntryRefRead | None
    # Deliberately not on ScheduleEntryRead (the raw, dateless entries list) -
    # "Legs every Monday" has completions on many different Mondays, so there's
    # no single correct value until a date is fixed, which only this
    # per-day response ever does.
    completion_id: uuid.UUID | None


class DayScheduleRead(BaseModel):
    """No `date` field - the date is already the key this value sits under in
    ScheduleResponse.days, so it isn't duplicated here.
    """

    model_config = ConfigDict(from_attributes=True)

    status: DayStatus
    entries: list[ResolvedEntryRead]
    cancelled: list[EntryRefRead]
    completed: bool


class ScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    days: dict[str, DayScheduleRead]
