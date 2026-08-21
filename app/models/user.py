import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, String, func
from sqlmodel import Field, SQLModel

# this is our user model that allows us to create a user table using python


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (
        # Lowercase-only: normalization happens on write (PATCH /me), this is
        # just the backstop. NULL passes, so rows without a username are fine.
        CheckConstraint(
            "username IS NULL OR username ~ '^[a-z0-9_]{3,20}$'",
            name="ck_users_username_format",
        ),
    )

    id: uuid.UUID = Field(primary_key=True)
    username: str | None = Field(default=None, unique=True, index=True)
    email: str
    # IANA name (e.g. "America/Los_Angeles"). No CHECK constraint - Postgres
    # can't validate one; validation is application-level only (PATCH /me).
    timezone: str = Field(sa_column=Column(String, nullable=False, server_default="UTC"))
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
