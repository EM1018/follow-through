from fastapi import FastAPI

from app.routers import activities, completions, me, plans, schedule, schedule_entries, workouts

app = FastAPI(title="follow-through API")
app.include_router(me.router)
app.include_router(plans.router)
app.include_router(workouts.router)
app.include_router(schedule_entries.router)
app.include_router(schedule.router)
app.include_router(activities.router)
app.include_router(completions.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
