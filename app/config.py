# allows us to obtain secret information from .env

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str
    SUPABASE_JWKS_URL: str
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str


@lru_cache
def get_settings() -> Settings:
    return Settings()
