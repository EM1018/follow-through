from fastapi import FastAPI

from app.routers import me, plans, workouts

app = FastAPI(title="follow-through API")
app.include_router(me.router)
app.include_router(plans.router)
app.include_router(workouts.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
