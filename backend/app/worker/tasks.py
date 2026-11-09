import asyncio
import logging
from datetime import datetime, timezone
from typing import NoReturn

import httpx
import redis

from app.adapters.chess.chesscom import ChessComClient, ChessComError
from app.cache.reports import CachedReport, RedisReportCache
from app.core.config import Settings, get_settings
from app.db.repository import SqlGameStore
from app.db.session import session_factory
from app.engine.stockfish import EngineUnavailable, StockfishEngine
from app.jobs.status import JobBook, RedisJobBook
from app.services.analyze import analyze_stored_game
from app.services.ingest import ingest_player as ingest_games
from app.worker.celery_app import ANALYSIS_TASK, INGESTION_TASK, celery_app

logger = logging.getLogger(__name__)


class _CeleryRequest:
    retries: int


class _BoundTask:
    """The parts of a Celery bound task this module uses. Celery ships without stubs."""

    max_retries: int
    request: _CeleryRequest

    def retry(self, *, exc: BaseException, countdown: int) -> NoReturn:
        raise NotImplementedError


@celery_app.task(name=INGESTION_TASK, bind=True, max_retries=3)  # type: ignore[untyped-decorator]  # celery has no type stubs
def ingest_player(
    self: _BoundTask,
    username: str,
    include_bullet: bool,
    job_id: str,
    needed: int | None = None,
    refresh_latest: bool = False,
) -> dict[str, object]:
    """ING-05 to ING-11. Network I/O stays on the ingestion queue, never in a request."""
    settings = get_settings()
    jobs = _jobs(settings)
    jobs.update(job_id, status="running")
    try:
        result = asyncio.run(_fetch(settings, username, include_bullet, needed, refresh_latest))
    except ChessComError as exc:
        if exc.status_code == 429 and _retries_left(self):
            raise self.retry(exc=exc, countdown=_backoff(self)) from exc
        _fail_ingest(settings, jobs, job_id, username, _chess_message(exc.status_code))
        logger.warning("ingest failed username=%s status=%s", username, exc.status_code)
        return {"status": "failed"}
    except httpx.TransportError as exc:
        if _retries_left(self):
            raise self.retry(exc=exc, countdown=_backoff(self)) from exc
        _fail_ingest(settings, jobs, job_id, username, "Chess.com could not be reached.")
        return {"status": "failed"}
    except Exception:
        logger.exception("ingest failed username=%s", username)
        _fail_ingest(settings, jobs, job_id, username, "Caissa could not fetch those games. Try again.")
        return {"status": "failed"}

    # Games are stored here and scored later, one at a time, when the player opens one.
    jobs.update(
        job_id,
        status="succeeded",
        games_total=result.selected,
        games_done=result.selected,
        progress_pct=100,
    )
    # Clear the per-username active key so a later sync can refresh; this job_id still polls.
    _forget_active(settings, username)
    logger.info(
        "ingest queued username=%s selected=%s pending=%s bullet_excluded=%s",
        username,
        result.selected,
        len(result.pending_ids),
        result.bullet_excluded,
    )
    return {"status": "queued", "pending": len(result.pending_ids)}


@celery_app.task(  # type: ignore[untyped-decorator]  # celery has no type stubs
    name=ANALYSIS_TASK,
    bind=True,
    max_retries=1,
    time_limit=600,
    soft_time_limit=540,
)
def analyze_game(self: object, internal_id: str, job_id: str) -> dict[str, object]:
    """ANA-02 to ANA-07. Stockfish runs here, with a hard time limit (ANA-06)."""
    del self
    settings = get_settings()
    jobs = _jobs(settings)
    session = session_factory()()
    store = SqlGameStore(session)
    try:
        try:
            engine = StockfishEngine(settings.stockfish_path, settings.stockfish_depth)
            outcome = analyze_stored_game(internal_id, store, engine)
        except EngineUnavailable:
            _fail_score(jobs, internal_id, job_id, "Stockfish is not configured on this machine.")
            return {"status": "failed"}
        except KeyError:
            _fail_score(jobs, internal_id, job_id, "That game could not be read.")
            return {"status": "failed"}
        except Exception:
            logger.exception("analyze failed game_id=%s", internal_id)
            _fail_score(jobs, internal_id, job_id, "Caissa could not score that game. Try again.")
            return {"status": "failed"}
    finally:
        session.close()

    state = jobs.mark_game_finished(job_id)
    jobs.release_game(internal_id)
    if state is not None and state.status == "succeeded" and state.games_total > 1:
        _remember_report(settings, state.username, job_id, state.games_total)
    return {"status": outcome["status"], "blunders": outcome["blunders"]}


async def _fetch(
    settings: Settings,
    username: str,
    include_bullet: bool,
    needed: int | None,
    refresh_latest: bool,
):
    session = session_factory()()
    store = SqlGameStore(session)
    try:
        async with ChessComClient(
            settings.chesscom_user_agent,
            settings.chesscom_timeout_seconds,
        ) as client:
            return await ingest_games(
                username=username,
                include_bullet=include_bullet,
                source=client,
                store=store,
                needed=needed,
                refresh_latest=refresh_latest,
            )
    finally:
        session.close()


def _jobs(settings: Settings) -> RedisJobBook:
    return RedisJobBook(redis.Redis.from_url(settings.redis_cache_url))


def _remember_report(settings: Settings, username: str, job_id: str, game_count: int) -> None:
    cache = RedisReportCache(
        redis.Redis.from_url(settings.redis_cache_url),
        ttl_seconds=settings.report_cache_ttl_seconds,
    )
    cache.store(
        CachedReport(
            username=username,
            job_id=job_id,
            generated_at=datetime.now(timezone.utc).isoformat(),
            game_count=game_count,
        )
    )


def _retries_left(task: _BoundTask) -> bool:
    return task.request.retries < task.max_retries


def _backoff(task: _BoundTask) -> int:
    return min(60, 2**task.request.retries)


def _fail_ingest(
    settings: Settings,
    jobs: JobBook,
    job_id: str,
    username: str,
    message: str,
) -> None:
    jobs.update(job_id, status="failed", error_message=message)
    _forget_active(settings, username)


def _fail_score(jobs: JobBook, game_id: str, job_id: str, message: str) -> None:
    jobs.release_game(game_id)
    jobs.update(job_id, status="failed", error_message=message)


def _forget_active(settings: Settings, username: str) -> None:
    try:
        RedisReportCache(
            redis.Redis.from_url(settings.redis_cache_url),
            ttl_seconds=settings.report_cache_ttl_seconds,
        ).forget_job(username)
    except Exception:
        logger.warning("could not clear active job username=%s", username)


def _chess_message(status_code: int) -> str:
    if status_code == 404:
        return "No Chess.com account was found for that username."
    if status_code == 429:
        return "Chess.com is limiting requests. Try again shortly."
    return "Chess.com could not be reached."
