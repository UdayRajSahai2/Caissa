import pytest

from app.api.rate_limit import RateLimitExceeded, SlidingWindowLimiter


def test_blocks_the_request_that_exceeds_the_window() -> None:
    clock = {"now": 100.0}
    limiter = SlidingWindowLimiter(limit=2, window_seconds=60, clock=lambda: clock["now"])

    limiter.check("127.0.0.1")
    limiter.check("127.0.0.1")
    with pytest.raises(RateLimitExceeded) as caught:
        limiter.check("127.0.0.1")
    assert caught.value.retry_after_seconds >= 1


def test_a_different_address_has_its_own_window() -> None:
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60, clock=lambda: 0.0)
    limiter.check("10.0.0.1")
    limiter.check("10.0.0.2")


def test_a_hit_expires_exactly_at_the_window_boundary() -> None:
    clock = {"now": 0.0}
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60, clock=lambda: clock["now"])
    limiter.check("127.0.0.1")
    clock["now"] = 60.0
    limiter.check("127.0.0.1")


def test_a_zero_limit_is_rejected() -> None:
    with pytest.raises(ValueError):
        SlidingWindowLimiter(limit=0, window_seconds=60)


def test_expired_hits_no_longer_count() -> None:
    clock = {"now": 0.0}
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60, clock=lambda: clock["now"])
    limiter.check("127.0.0.1")
    clock["now"] = 61.0
    limiter.check("127.0.0.1")


def test_expired_addresses_are_dropped() -> None:
    clock = {"now": 0.0}
    limiter = SlidingWindowLimiter(limit=1, window_seconds=60, clock=lambda: clock["now"])
    limiter.check("old")
    clock["now"] = 61.0
    limiter.check("new")
    assert "old" not in limiter._hits
    assert "new" in limiter._hits
