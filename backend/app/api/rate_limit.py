import time
from collections.abc import Callable
from typing import TYPE_CHECKING, Protocol
from uuid import uuid4

if TYPE_CHECKING:
    import redis


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__("rate limit exceeded")


class SlidingWindowLimiter:
    """In-process limit, for tests and a single process. Production uses RedisSlidingWindowLimiter."""

    def __init__(
        self,
        limit: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if limit < 1 or window_seconds < 1:
            raise ValueError("rate limit requires a positive limit and window")
        self._limit = limit
        self._window_seconds = window_seconds
        self._clock = clock
        self._hits: dict[str, list[float]] = {}

    def check(self, key: str) -> None:
        now = self._clock()
        cutoff = now - self._window_seconds
        self._drop_expired(cutoff)
        recent = [stamp for stamp in self._hits.get(key, []) if stamp > cutoff]
        if len(recent) >= self._limit:
            retry_after = max(1, int(self._window_seconds - (now - recent[0])) + 1)
            self._hits[key] = recent
            raise RateLimitExceeded(retry_after)
        recent.append(now)
        self._hits[key] = recent

    def _drop_expired(self, cutoff: float) -> None:
        stale = [name for name, stamps in self._hits.items() if all(stamp <= cutoff for stamp in stamps)]
        for name in stale:
            del self._hits[name]


class Limiter(Protocol):
    def check(self, key: str) -> None: ...


class RedisSlidingWindowLimiter:
    """The same sliding window, shared by every API process through Redis (SECURITY.md).

    Each key is a sorted set of request times. Old times are dropped, the rest are counted,
    and the key expires on its own once the window passes.
    """

    def __init__(self, client: "redis.Redis", limit: int, window_seconds: int, prefix: str) -> None:
        if limit < 1 or window_seconds < 1:
            raise ValueError("rate limit requires a positive limit and window")
        self._client = client
        self._limit = limit
        self._window_seconds = window_seconds
        self._prefix = prefix

    def check(self, key: str) -> None:
        now = time.time()
        name = f"caissa:ratelimit:{self._prefix}:{key}"
        pipe = self._client.pipeline(transaction=True)
        pipe.zremrangebyscore(name, 0, now - self._window_seconds)
        pipe.zcard(name)
        pipe.zrange(name, 0, 0, withscores=True)
        _removed, count, oldest = pipe.execute()
        if int(count) >= self._limit:
            first = float(oldest[0][1]) if oldest else now
            raise RateLimitExceeded(max(1, int(self._window_seconds - (now - first)) + 1))
        pipe = self._client.pipeline(transaction=True)
        pipe.zadd(name, {f"{now:.6f}:{uuid4().hex}": now})
        pipe.expire(name, self._window_seconds)
        pipe.execute()
