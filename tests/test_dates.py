from datetime import date, datetime
from unittest.mock import patch
from uuid import uuid4

from app.models.user import User
from app.services import dates


def _user(timezone: str) -> User:
    return User(id=uuid4(), email="tz@example.com", timezone=timezone)


def test_user_today_uses_the_users_stored_timezone() -> None:
    # 2026-08-09 02:00 UTC is still the evening of 2026-08-08 in Los Angeles
    # (UTC-7 in August) - this is the exact class of instant the old
    # UTC-only "today" got wrong.
    instant = datetime(2026, 8, 9, 2, 0, tzinfo=dates.UTC)
    with patch.object(dates, "_now", return_value=instant):
        assert dates.user_today(_user("America/Los_Angeles")) == date(2026, 8, 8)


def test_user_today_for_utc_user_matches_utc_date() -> None:
    instant = datetime(2026, 8, 9, 2, 0, tzinfo=dates.UTC)
    with patch.object(dates, "_now", return_value=instant):
        assert dates.user_today(_user("UTC")) == date(2026, 8, 9)
