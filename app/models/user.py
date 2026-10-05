import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, Index, String, func
from sqlalchemy import text as satext
from sqlmodel import Field, SQLModel

# this is our user model that allows us to create a user table using python


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (
        # Stored as typed - the format is validated on write (PATCH /me), this
        # is just the backstop. NULL passes, so rows without a username are fine.
        CheckConstraint(
            "username IS NULL OR username ~ '^[A-Za-z0-9_]{3,20}$'",
            name="ck_users_username_format",
        ),
        # Compared without case: "Sam" and "sam" are the same name. An index
        # rather than a UniqueConstraint because Postgres only allows unique
        # constraints over plain columns. NULLs are distinct, so rows without
        # a username never collide.
        Index("uq_users_username_lower", satext("lower(username)"), unique=True),
    )

    id: uuid.UUID = Field(primary_key=True)
    username: str | None = Field(default=None)
    email: str
    # IANA name (e.g. "America/Los_Angeles"). No CHECK constraint - Postgres
    # can't validate one; validation is application-level only (PATCH /me).
    timezone: str = Field(sa_column=Column(String, nullable=False, server_default="UTC"))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
