# Follow Through

The Premise:
A mobile app for helping me stay consistent with workout plans, follow through on my goals, and compete in friendly challenges with friends.  

The Goal:
follow-thru is a tool that aims to make it easier for users to visualize their workout plan and goals. It also aims to help users stick to their workout plans by allowing them to set custom goals for themselves, send friendly challenges, and log their activities. follow-thru is for individuals who want to better organize their workout plan, meet their goals, stay motivated and motivate others, and help others follow through on their goals by participating in friendly challenges. 


## Features



- Create a custom workout plan where you decide when it starts and ends 
- Add workouts to your plan for each day of the week
- Choose when you want to repeat your workouts, e.g. Bench Press every Monday
- If you want to switch it up one day, swap a workout for a new or existing workout 
- Set custom goals that you want to accomplish over a certain amount of time, or for as long as you can
- Complete your workouts and log them so you can see your progress visually through a contribution-style graph
- Send friendly challenges to friends where you both participate in the challenge that you send them, or that they send you [in development]

## Tech Stack

| Layer     | Stack                                                                 |
| --------- | ---------------------------------------------------------------------- |
| Backend   | FastAPI, SQLModel, PostgreSQL (Supabase), Alembic, JWT/JWKS auth       |
| Mobile    | React Native, Expo (Router), TypeScript, TanStack Query                |
| Contract  | OpenAPI spec generated from FastAPI → TypeScript types via `openapi-typescript` |
| Testing   | pytest / pytest-asyncio (backend), Jest (mobile)                       |



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

## Project Structure

```
app/            FastAPI application (routers, models, schemas, services)
alembic/        Database migrations
contract/       Generated OpenAPI spec
mobile/         Expo / React Native client
tests/          Backend test suite
```

