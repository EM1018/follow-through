# Follow Through

The Premise:
A mobile app for helping me stay consistent with workout plans, follow through on my goals, and compete in friendly challenges with friends.  

The Goal:
follow-thru is a tool that aims to make it easier for users to visualize their workout plan and goals. It also aims to help users stick to their workout plans by allowing them to set custom goals for themselves, send friendly challenges, and log their activities. follow-thru is for individuals who want to better organize their workout plan, meet their goals, stay motivated and motivate others, and help others follow through on their goals by participating in friendly challenges. 

## Demo

*[Add a screen recording or GIF of the app here, e.g.:]*
`![demo](docs/demo.gif)`

*[Optional: screenshots of key screens — plan view, schedule, workout entry — laid out side by side.]*

*[Optional: link to TestFlight if you've published a build.]*

## Features

*[Bullet the things a user can actually do. Keep each one concrete — "create a workout plan and schedule it across the week," not "workout management." e.g.:]*

- ...
- ...
- ...

## Tech Stack

| Layer     | Stack                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Backend   | FastAPI, SQLModel, PostgreSQL (Supabase), Alembic, JWT/JWKS auth       |
| Mobile    | React Native, Expo (Router), TypeScript, TanStack Query                |
| Contract  | OpenAPI spec generated from FastAPI → TypeScript types via `openapi-typescript` |
| Testing   | pytest / pytest-asyncio (backend), Jest (mobile)                       |

## Architecture

*[Optional: a short paragraph or diagram of how the pieces fit together — e.g. how the mobile client auths against Supabase, gets a JWT, and calls the FastAPI backend which verifies it against Supabase's JWKS endpoint before hitting Postgres.]*

## Getting Started

### Backend

```bash
# install dependencies
uv sync

# start Postgres (dev on 5432, test on 5433)
docker compose up -d

# copy env vars
cp .env.example .env

# apply migrations
uv run alembic upgrade head

# run the dev server
uv run uvicorn app.main:app --reload

# run tests
uv run pytest

# lint / format
uv run ruff check .
uv run ruff format .
```

### Mobile

See [`mobile/README.md`](mobile/README.md) for full setup, including per-target `EXPO_PUBLIC_API_URL` configuration (simulator vs. physical device vs. emulator).

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

## API Documentation

- Interactive docs (Swagger UI): `http://localhost:8000/docs` once the backend is running
- OpenAPI spec: [`contract/openapi.json`](contract/openapi.json)
- Mobile client types are generated from the spec via `npm run gen:api`

## Testing

```bash
uv run pytest
```

*[Optional: mention what's covered — auth, scheduling/resolution logic, DB constraints, migrations — and current coverage % if you want to state one.]*

## Project Structure

```
app/            FastAPI application (routers, models, schemas, services)
alembic/        Database migrations
contract/       Generated OpenAPI spec
mobile/         Expo / React Native client
tests/          Backend test suite
```

## Roadmap

*[Optional: what's next / known gaps — useful if this is explicitly a WIP.]*

- [ ] ...
- [ ] ...

## License

*[Add if you want one — e.g. MIT.]*
