from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings

settings = get_settings()

# start talking to a new DB but changind db url (restart)

# default pool (5 + 10 overflow = 15) was measured via load test to queue
# requests once concurrency exceeded it, inflating p50/p99 latency
engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_size=20, max_overflow=20)

async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# for routes that depend on this, run queries for this session
async def get_session() -> AsyncGenerator[AsyncSession, None]:  # pragma: no cover
    async with async_session_maker() as session:
        yield session
