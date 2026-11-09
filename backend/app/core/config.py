from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote_plus

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Process configuration. Values come from the environment or the repo `.env`."""

    model_config = SettingsConfigDict(
        env_file=_REPO_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    chesscom_user_agent: str = "Caissa/0.1 (portfolio chess analytics; contact: local-dev)"
    chesscom_timeout_seconds: float = 10.0
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    rate_limit_requests: int = 5
    rate_limit_global_requests: int = 60
    # GAM-06: puzzle attempts and lessons are small writes, so they get their own, wider limit.
    rate_limit_activity_requests: int = 60
    rate_limit_window_seconds: int = 60
    # "redis" shares limits across API processes (SECURITY.md); "memory" is for tests.
    rate_limit_backend: Literal["memory", "redis"] = "redis"
    # Shared secret between the Next.js server and this API (AUTH-03). Empty means every call is refused.
    internal_token: str = ""
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    redis_cache_url: str = "redis://localhost:6379/2"
    postgres_user: str = "caissa"
    postgres_password: str = "change-me-local-only"
    postgres_db: str = "caissa"
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5432
    stockfish_path: str = ""
    stockfish_depth: int = 14
    report_cache_ttl_seconds: int = 86_400
    enable_docs: bool = True

    @property
    def database_url(self) -> str:
        user = quote_plus(self.postgres_user)
        password = quote_plus(self.postgres_password)
        return (
            f"postgresql+psycopg://{user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
