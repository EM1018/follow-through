import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from app.config import get_settings  # noqa: E402

load_dotenv()
settings = get_settings()

EMAIL = os.environ.get("SUPABASE_TEST_EMAIL")
PASSWORD = os.environ.get("SUPABASE_TEST_PASSWORD")

if not EMAIL or not PASSWORD:
    raise SystemExit(
        "Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD in .env "
        "(a user you created in the Supabase dashboard)."
    )

resp = httpx.post(
    f"{settings.SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": settings.SUPABASE_ANON_KEY},
    json={"email": EMAIL, "password": PASSWORD},
)
resp.raise_for_status()
print(resp.json()["access_token"])
