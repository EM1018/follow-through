# Follow Through API

Backend for Follow Through, an iOS fitness app that helps users stay consistent with their workout
plans and compete in fitness challenges with friends. Built with FastAPI, SQLModel, and PostgreSQL
(via Supabase), managed with `uv`.

## Development

```bash
# install dependencies
uv sync

# start Postgres (dev on 5432, test on 5433)
docker compose up -d

# copy env vars
cp .env.example .env

# run the dev server
uv run uvicorn app.main:app --reload

# run tests
uv run pytest

# lint / format
uv run ruff check .
uv run ruff format .
```
