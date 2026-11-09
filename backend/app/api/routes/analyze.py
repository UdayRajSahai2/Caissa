import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import enforce_rate_limit, get_ingest_queue, get_job_book, get_report_cache, require_app_origin
from app.api.schemas import AnalyzeAccepted, JobProgress
from app.cache.reports import ReportCache
from app.domain.username import UsernameError, validate_username
from app.jobs.active import reusable_ingest_job
from app.jobs.status import JobBook
from app.services.queue import IngestQueue

logger = logging.getLogger(__name__)

router = APIRouter()

_MISSING_JOB = "No analysis job was found with that id."


@router.get("/analyze/{username}", response_model=AnalyzeAccepted)
async def analyze_player(
    username: str,
    request: Request,
    include_bullet: bool = False,
    cache: ReportCache = Depends(get_report_cache),
    jobs: JobBook = Depends(get_job_book),
    queue: IngestQueue = Depends(get_ingest_queue),
) -> AnalyzeAccepted:
    """Validate, then either return a fresh report or enqueue ingestion. JOB-01, ING-03."""
    try:
        validated = validate_username(username)
    except UsernameError:
        raise HTTPException(status_code=422, detail="Chess.com username is not valid.") from None
    require_app_origin(request)
    enforce_rate_limit(request)

    cached = cache.fresh(validated)
    if cached is not None:
        return AnalyzeAccepted(username=validated, job_id=cached.job_id, status="cached")

    active = reusable_ingest_job(jobs, cache, validated)
    if active is not None:
        return AnalyzeAccepted(username=validated, job_id=active, status="queued")

    job_id = str(uuid4())
    jobs.create(job_id, validated)
    cache.remember_job(validated, job_id)
    queue.enqueue(validated, include_bullet, job_id)
    logger.info("enqueued ingest username=%s include_bullet=%s", validated, include_bullet)
    return AnalyzeAccepted(username=validated, job_id=job_id, status="queued")


@router.get("/jobs/{job_id}", response_model=JobProgress)
def read_job(
    job_id: str,
    jobs: JobBook = Depends(get_job_book),
) -> JobProgress:
    """JOB-02. Progress only. Game text stays in the database."""
    try:
        UUID(job_id)
    except ValueError:
        raise HTTPException(status_code=404, detail=_MISSING_JOB) from None
    state = jobs.get(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail=_MISSING_JOB)
    return JobProgress(
        job_id=state.job_id,
        status=state.status,
        progress_pct=state.progress_pct,
        games_done=state.games_done,
        games_total=state.games_total,
        error_message=state.error_message,
    )
