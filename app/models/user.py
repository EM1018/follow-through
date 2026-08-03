import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, func
from sqlmodel import Field, SQLModel


# this is our user model that allows us to create a user table using python

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(primary_key=True)
    username: str | None = Field(default=None, unique=True, index=True)
    email: str
    created_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    )
