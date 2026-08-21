from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.models.user import User


def _now() -> datetime:
    """The one clock read in this module - tests patch this, callers never
    read a clock directly. Never datetime.utcnow(): it returns a naive
    datetime, which is what let the old UTC-only "today" bug happen.
    """
    return datetime.now(UTC)


def user_today(user: User) -> date:
    """"Today" as this user would see it on their own clock, not the
    server's. Every current-date read in the app should go through this.
    """
    return _now().astimezone(ZoneInfo(user.timezone)).date()
