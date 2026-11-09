from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import redis
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.adapters.chess.chesscom import ChessComClient
from app.api.auth import current_user
from app.api.rate_limit import Limiter, RedisSlidingWindowLimiter, SlidingWindowLimiter
from app.api.routes.account import router as account_router
from app.api.routes.analyze import router as analyze_router
from app.api.routes.library import router as library_router
from app.api.routes.progress import router as progress_router
from app.api.schemas import HealthResponse
from app.core.config import Settings, get_settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Cache-Control"] = "no-store"
        return response


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else get_settings()
    app = FastAPI(
        title="Caissa",
        lifespan=_lifespan,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
    )
    app.state.settings = settings
    app.state.user_limiter = _limiter(settings, settings.rate_limit_requests, "user")
    app.state.global_limiter = _limiter(settings, settings.rate_limit_global_requests, "global")
    app.state.activity_limiter = _limiter(settings, settings.rate_limit_activity_requests, "activity")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Accept", "Content-Type"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    # The library report is a few hundred KB of JSON; it compresses to a small share of that.
    # Responses hold public game data only, no secrets or tokens, so compression is safe here.
    app.add_middleware(GZipMiddleware, minimum_size=1_000)
    # AUTH-03: every analysis and account route needs the Next.js secret and a signed-in user.
    signed_in = [Depends(current_user)]
    app.include_router(analyze_router, dependencies=signed_in)
    app.include_router(library_router, dependencies=signed_in)
    app.include_router(account_router, dependencies=signed_in)
    app.include_router(progress_router, dependencies=signed_in)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    return app


def _limiter(settings: Settings, limit: int, prefix: str) -> Limiter:
    if settings.rate_limit_backend == "redis":
        return RedisSlidingWindowLimiter(
            redis.Redis.from_url(settings.redis_cache_url),
            limit=limit,
            window_seconds=settings.rate_limit_window_seconds,
            prefix=prefix,
        )
    return SlidingWindowLimiter(limit=limit, window_seconds=settings.rate_limit_window_seconds)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    client = ChessComClient(
        user_agent=settings.chesscom_user_agent,
        timeout_seconds=settings.chesscom_timeout_seconds,
    )
    await client.open()
    app.state.chesscom = client
    try:
        yield
    finally:
        await client.close()
