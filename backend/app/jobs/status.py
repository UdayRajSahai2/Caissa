import json
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Protocol

from redis.exceptions import WatchError

# Longer than the analysis hard time limit (600s) so a live claim outlasts Stockfish.
# Short enough that a killed worker does not block a game for a full day.
SCORE_CLAIM_TTL_SECONDS = 15 * 60
JOB_TTL_SECONDS = 60 * 60 * 24
_OPEN = frozenset({"queued", "running"})


@dataclass
class JobState:
    job_id: str
    username: str
    status: str
    progress_pct: int = 0
    games_done: int = 0
    games_total: int = 0
    error_message: str | None = None

    def public_error(self) -> str | None:
        return self.error_message


class JobBook(Protocol):
    def create(self, job_id: str, username: str) -> None: ...

    def get(self, job_id: str) -> JobState | None: ...

    def update(self, job_id: str, **fields: object) -> None: ...

    def mark_game_finished(self, job_id: str) -> JobState | None: ...

    def active_game(self, game_id: str) -> str | None: ...

    def claim_game(self, game_id: str, job_id: str) -> str | None: ...

    def release_game(self, game_id: str) -> None: ...


class MemoryJobBook:
    def __init__(self) -> None:
        self.jobs: dict[str, JobState] = {}
        self._games: dict[str, str] = {}
        self._done: dict[str, int] = {}
        self._lock = threading.Lock()

    def create(self, job_id: str, username: str) -> None:
        with self._lock:
            self.jobs[job_id] = JobState(job_id=job_id, username=username.casefold(), status="queued")
            self._done[job_id] = 0

    def get(self, job_id: str) -> JobState | None:
        with self._lock:
            state = self.jobs.get(job_id)
            return None if state is None else JobState(**asdict(state))

    def update(self, job_id: str, **fields: object) -> None:
        with self._lock:
            state = self.jobs[job_id]
            for key, value in fields.items():
                setattr(state, key, value)
            if state.games_total and state.status != "failed":
                state.progress_pct = min(100, round(state.games_done * 100 / state.games_total))

    def mark_game_finished(self, job_id: str) -> JobState | None:
        with self._lock:
            state = self.jobs.get(job_id)
            if state is None:
                return None
            done = self._done.get(job_id, 0) + 1
            self._done[job_id] = done
            state.games_done = done
            _apply_progress(state, done)
            return JobState(**asdict(state))

    def active_game(self, game_id: str) -> str | None:
        with self._lock:
            return self._games.get(game_id)

    def claim_game(self, game_id: str, job_id: str) -> str | None:
        """Record job_id unless this game already has one. Return the earlier id."""
        with self._lock:
            current = self._games.get(game_id)
            if current is not None:
                return current
            self._games[game_id] = job_id
            return None

    def release_game(self, game_id: str) -> None:
        with self._lock:
            self._games.pop(game_id, None)


class RedisJobBook:
    """Job progress for polling. Keys live in the cache Redis database, not the Celery one."""

    def __init__(
        self,
        client: object,
        ttl_seconds: int = JOB_TTL_SECONDS,
        claim_ttl_seconds: int = SCORE_CLAIM_TTL_SECONDS,
    ) -> None:
        self._redis = client
        self._ttl = ttl_seconds
        self._claim_ttl = claim_ttl_seconds

    def create(self, job_id: str, username: str) -> None:
        state = JobState(job_id=job_id, username=username.casefold(), status="queued")
        self._write(state)
        self._redis.delete(_done_key(job_id))  # type: ignore[attr-defined]

    def get(self, job_id: str) -> JobState | None:
        raw = self._redis.get(_key(job_id))  # type: ignore[attr-defined]
        if raw is None:
            return None
        payload = json.loads(raw)
        return JobState(**payload)

    def update(self, job_id: str, **fields: object) -> None:
        key = _key(job_id)
        for _ in range(5):
            try:
                pipe = self._redis.pipeline(True)  # type: ignore[attr-defined]
                pipe.watch(key)
                raw = pipe.get(key)
                if raw is None:
                    pipe.unwatch()
                    return
                state = JobState(**json.loads(raw))
                for name, value in fields.items():
                    setattr(state, name, value)
                if state.games_total and state.status != "failed":
                    state.progress_pct = min(100, round(state.games_done * 100 / state.games_total))
                pipe.multi()
                pipe.set(key, json.dumps(asdict(state)), ex=self._ttl)
                pipe.execute()
                return
            except WatchError:
                continue

    def mark_game_finished(self, job_id: str) -> JobState | None:
        done = int(self._redis.incr(_done_key(job_id)))  # type: ignore[attr-defined]
        self._redis.expire(_done_key(job_id), self._ttl)  # type: ignore[attr-defined]
        key = _key(job_id)
        for _ in range(5):
            try:
                pipe = self._redis.pipeline(True)  # type: ignore[attr-defined]
                pipe.watch(key)
                raw = pipe.get(key)
                if raw is None:
                    pipe.unwatch()
                    return None
                state = JobState(**json.loads(raw))
                state.games_done = done
                _apply_progress(state, done)
                pipe.multi()
                pipe.set(key, json.dumps(asdict(state)), ex=self._ttl)
                pipe.execute()
                return state
            except WatchError:
                continue
        return self.get(job_id)

    def active_game(self, game_id: str) -> str | None:
        raw = self._redis.get(_score_key(game_id))  # type: ignore[attr-defined]  # client is typed as object
        return _text(raw)

    def claim_game(self, game_id: str, job_id: str) -> str | None:
        key = _score_key(game_id)
        stored = self._redis.set(key, job_id, nx=True, ex=self._claim_ttl)  # type: ignore[attr-defined]
        if stored:
            return None
        return _text(self._redis.get(key))  # type: ignore[attr-defined]

    def release_game(self, game_id: str) -> None:
        self._redis.delete(_score_key(game_id))  # type: ignore[attr-defined]

    def _write(self, state: JobState) -> None:
        self._redis.set(_key(state.job_id), json.dumps(asdict(state)), ex=self._ttl)  # type: ignore[attr-defined]


def is_open_status(status: str) -> bool:
    return status in _OPEN


def _apply_progress(state: JobState, done: int) -> None:
    """Bump games_done. Never clear a failed status when a sibling game finishes."""
    if state.status == "failed":
        if state.games_total:
            state.progress_pct = min(100, round(done * 100 / state.games_total))
        return
    finished = bool(state.games_total and done >= state.games_total)
    state.status = "succeeded" if finished else "running"
    state.progress_pct = (
        100 if finished else (min(100, round(done * 100 / state.games_total)) if state.games_total else 0)
    )


def _key(job_id: str) -> str:
    return f"caissa:job:{job_id}"


def _done_key(job_id: str) -> str:
    return f"caissa:job:{job_id}:done"


def _score_key(game_id: str) -> str:
    return f"caissa:score:{game_id}"


def _text(raw: object) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, bytes):
        return raw.decode()
    return str(raw)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
