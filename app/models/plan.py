import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Column, DateTime, Index, func, text
from sqlmodel import Field, SQLModel


class Plan(SQLModel, table=True):
    __tablename__ = "plans"
    __table_args__ = (
        # enforces "at most one active plan per user" at the DB level, as a backstop
        # to the same rule enforced in app/routers/plans.py's endpoint logic
        Index(
            "ix_plans_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
        # backstop for the same rule PlanCreate/PlanUpdate enforce in Pydantic -
        # ScheduleEntry already has this exact backstop, Plan never did
        CheckConstraint(
            "ends_on IS NULL OR ends_on >= starts_on", name="ck_plans_ends_after_starts"
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", ondelete="CASCADE", index=True)
    name: str = Field(min_length=1, max_length=100)
    is_active: bool = Field(default=True)
    starts_on: date
    ends_on: date | None = Field(default=None)
    visible_to_friends: bool = Field(default=False)
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )