from collections.abc import Iterator

import redis
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.adapters.chess.chesscom import ChessComClient
from app.api.rate_limit import RateLimitExceeded
from app.cache.reports import RedisReportCache, ReportCache
from app.jobs.status import JobBook, RedisJobBook

from app.db.memory import MemoryGameStore
from app.db.repository import SqlGameStore
from app.db.session import session_factory
from app.services.queue import AnalysisQueue, CeleryAnalysisQueue, CeleryIngestQueue, IngestQueue


def get_source(request: Request) -> ChessComClient:
    client = getattr(request.app.state, "chesscom", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Chess.com client is not ready.")
    return client


def _limited(exc: RateLimitExceeded, detail: str) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=detail,
        headers={"Retry-After": str(exc.retry_after_seconds)},
    )


def get_report_cache(request: Request) -> ReportCache:
    cache = getattr(request.app.state, "report_cache", None)
    if cache is None:
        settings = request.app.state.settings
        cache = RedisReportCache(
            redis.Redis.from_url(settings.redis_cache_url),
            ttl_seconds=settings.report_cache_ttl_seconds,
        )
        request.app.state.report_cache = cache
    return cache


def get_job_book(request: Request) -> JobBook:
    book = getattr(request.app.state, "jobs", None)
    if book is None:
        book = RedisJobBook(redis.Redis.from_url(request.app.state.settings.redis_cache_url))
        request.app.state.jobs = book
    return book


def get_store(request: Request) -> Iterator[SqlGameStore | MemoryGameStore]:
    store = getattr(request.app.state, "game_store", None)
    if store is not None:
        yield store
        return
    session: Session = session_factory()()
    try:
        yield SqlGameStore(session)
    finally:
        session.close()


def get_analysis_queue(request: Request) -> AnalysisQueue:
    queue = getattr(request.app.state, "analysis_queue", None)
    if queue is None:
        queue = CeleryAnalysisQueue()
        request.app.state.analysis_queue = queue
    return queue


def get_ingest_queue(request: Request) -> IngestQueue:
    queue = getattr(request.app.state, "ingest_queue", None)
    if queue is None:
        queue = CeleryIngestQueue()
        request.app.state.ingest_queue = queue
    return queue


def require_app_origin(request: Request) -> None:
    """Reject a browser call whose Origin is not this app.

    A cross-origin page sends Origin. Missing Origin is a non-browser client.
    """
    origin = request.headers.get("origin")
    if origin is None:
        return
    allowed = request.app.state.settings.cors_origins
    if origin not in allowed:
        raise HTTPException(status_code=403, detail="This action is only available from the Caissa app.")


def enforce_rate_limit(request: Request) -> None:
    """Per signed-in user, then global. Every call arrives from the Next.js server, so the
    client address would lump all users together; the verified user key does not (AUTH-03)."""
    user = getattr(request.state, "user_key", None)
    if not isinstance(user, str):
        raise HTTPException(status_code=401, detail="Sign in to use Caissa.")
    try:
        request.app.state.user_limiter.check(user)
    except RateLimitExceeded as exc:
        raise _limited(
            exc,
            "Too many analysis requests from your account. Try again shortly.",
        ) from exc
    try:
        request.app.state.global_limiter.check("global")
    except RateLimitExceeded as exc:
        raise _limited(
            exc,
            "Caissa is busy with analysis requests. Try again shortly.",
        ) from exc
