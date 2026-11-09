import json
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol


@dataclass
class CachedReport:
    username: str
    job_id: str
    generated_at: str
    game_count: int


class ReportCache(Protocol):
    def fresh(self, username: str) -> CachedReport | None: ...

    def store(self, report: CachedReport) -> None: ...

    def active_job(self, username: str) -> str | None: ...

    def remember_job(self, username: str, job_id: str) -> None: ...

    def forget_job(self, username: str) -> None: ...


class MemoryReportCache:
    def __init__(self, ttl: timedelta = timedelta(hours=24)) -> None:
        self._ttl = ttl
        self._reports: dict[str, tuple[datetime, CachedReport]] = {}
        self._jobs: dict[str, str] = {}
        self._now = lambda: datetime.now(timezone.utc)

    def fresh(self, username: str) -> CachedReport | None:
        found = self._reports.get(username.casefold())
        if found is None:
            return None
        stored_at, report = found
        if self._now() - stored_at > self._ttl:
            return None
        return report

    def store(self, report: CachedReport) -> None:
        self._reports[report.username.casefold()] = (self._now(), report)
        self._jobs.pop(report.username.casefold(), None)

    def active_job(self, username: str) -> str | None:
        return self._jobs.get(username.casefold())

    def remember_job(self, username: str, job_id: str) -> None:
        self._jobs[username.casefold()] = job_id

    def forget_job(self, username: str) -> None:
        self._jobs.pop(username.casefold(), None)


class RedisReportCache:
    def __init__(self, client: object, ttl_seconds: int = 86_400) -> None:
        self._redis = client
        self._ttl = ttl_seconds

    def fresh(self, username: str) -> CachedReport | None:
        raw = self._redis.get(_report_key(username))  # type: ignore[attr-defined]
        if raw is None:
            return None
        return CachedReport(**json.loads(raw))

    def store(self, report: CachedReport) -> None:
        self._redis.set(_report_key(report.username), json.dumps(asdict(report)), ex=self._ttl)  # type: ignore[attr-defined]
        self._redis.delete(_job_key(report.username))  # type: ignore[attr-defined]

    def active_job(self, username: str) -> str | None:
        raw = self._redis.get(_job_key(username))  # type: ignore[attr-defined]
        if raw is None:
            return None
        return raw.decode() if isinstance(raw, bytes) else str(raw)

    def remember_job(self, username: str, job_id: str) -> None:
        self._redis.set(_job_key(username), job_id, ex=60 * 60 * 2)  # type: ignore[attr-defined]

    def forget_job(self, username: str) -> None:
        self._redis.delete(_job_key(username))  # type: ignore[attr-defined]  # client is typed as object


def _report_key(username: str) -> str:
    return f"caissa:report:{username.casefold()}"


def _job_key(username: str) -> str:
    return f"caissa:active:{username.casefold()}"
