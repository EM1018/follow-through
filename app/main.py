from fastapi import FastAPI

from app.routers import me

app = FastAPI(title="follow-through API")
app.include_router(me.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
