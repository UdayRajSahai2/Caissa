"""Per-username ingest dedupe. One open download at a time."""

from app.cache.reports import ReportCache
from app.jobs.status import JobBook, is_open_status


def reusable_ingest_job(jobs: JobBook, cache: ReportCache, username: str) -> str | None:
    """Return the open ingest job for this player, or clear a stale active key."""
    active = cache.active_job(username)
    if active is None:
        return None
    state = jobs.get(active)
    if state is not None and is_open_status(state.status):
        return active
    cache.forget_job(username)
    return None
