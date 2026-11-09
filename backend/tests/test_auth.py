"""AUTH-01..05 (API side): a signed-in user, forwarded by the Next.js server, may analyze any public player."""

import pytest
import redis
from fastapi.testclient import TestClient

from app.adapters.chess.chesscom import ChessComError
from app.adapters.chess.urls import is_allowed_archive_url
from app.api.rate_limit import RateLimitExceeded, RedisSlidingWindowLimiter
from app.cache.reports import MemoryReportCache
from app.core.config import Settings
from app.db.memory import MemoryGameStore
from app.db.saved_players import MemorySavedPlayerStore
from app.jobs.status import MemoryJobBook
from app.main import create_app
from tests.auth_helpers import AUTH_HEADERS, OTHER_USER, TEST_TOKEN


class FakeChessCom:
    def __init__(self, exists: bool = True, status: int | None = None) -> None:
        self.exists = exists
        self.status = status

    async def player_exists(self, username: str) -> bool:
        if self.status is not None:
            raise ChessComError(self.status)
        return self.exists


class NoQueue:
    def enqueue(self, *args: object, **kwargs: object) -> None:
        return None

    def enqueue_game(self, *args: object) -> None:
        return None


def _app(limit: int = 20, token: str = TEST_TOKEN) -> TestClient:
    settings = Settings(
        _env_file=None,
        internal_token=token,
        rate_limit_backend="memory",
        rate_limit_requests=limit,
        rate_limit_global_requests=100,
        enable_docs=False,
    )
    app = create_app(settings)
    app.state.saved_players = MemorySavedPlayerStore()
    app.state.game_store = MemoryGameStore()
    app.state.jobs = MemoryJobBook()
    app.state.report_cache = MemoryReportCache()
    app.state.ingest_queue = NoQueue()
    app.state.analysis_queue = NoQueue()
    app.state.chesscom = FakeChessCom()
    return TestClient(app)


def test_health_is_public_but_everything_else_needs_the_server_secret() -> None:
    client = _app()
    assert client.get("/health").status_code == 200
    for path in ("/library/hikaru", "/library/hikaru/report", "/me/players", "/jobs/00000000-0000-0000-0000-000000000000"):
        response = client.get(path)
        assert response.status_code == 401, path
        assert response.json()["detail"] == "Sign in to use Caissa."


def test_a_wrong_secret_a_bad_user_id_or_an_unset_server_secret_is_refused() -> None:
    client = _app()
    assert client.get("/me/players", headers={**AUTH_HEADERS, "x-caissa-internal": "guess"}).status_code == 401
    for user in ("", "github:", "evil:1", "github:1;drop", "github:" + "a" * 65):
        assert client.get("/me/players", headers={**AUTH_HEADERS, "x-caissa-user": user}).status_code == 401, user
    unset = _app(token="")
    assert unset.get("/me/players", headers={**AUTH_HEADERS, "x-caissa-internal": ""}).status_code == 401


def test_any_signed_in_user_can_open_any_public_player() -> None:
    client = _app()
    for headers in (AUTH_HEADERS, {**AUTH_HEADERS, "x-caissa-user": OTHER_USER}):
        assert client.get("/library/magnus/report", headers=headers).status_code == 200
        assert client.get("/library/hikaru", headers=headers).status_code == 200


def test_invalid_names_are_rejected_and_never_echoed() -> None:
    client = _app()
    response = client.get("/library/%3Cscript%3E/report", headers=AUTH_HEADERS)
    assert response.status_code == 422
    assert "<script>" not in response.text


def test_saving_a_player_checks_it_exists_and_keeps_a_list_per_user() -> None:
    client = _app()
    saved = client.post("/me/players/Magnus/save", headers=AUTH_HEADERS)
    assert saved.status_code == 200
    assert saved.json() == {"players": ["magnus"]}
    assert client.post("/me/players/magnus/save", headers=AUTH_HEADERS).json() == {"players": ["magnus"]}
    other = {**AUTH_HEADERS, "x-caissa-user": OTHER_USER}
    assert client.get("/me/players", headers=other).json() == {"players": []}
    assert client.post("/me/players/magnus/save", headers=other).status_code == 200
    assert client.post("/me/players/magnus/remove", headers=AUTH_HEADERS).status_code == 204
    assert client.get("/me/players", headers=AUTH_HEADERS).json() == {"players": []}
    assert client.get("/me/players", headers=other).json() == {"players": ["magnus"]}


def test_saving_a_player_that_does_not_exist_or_when_chesscom_is_down() -> None:
    client = _app()
    client.app.state.chesscom = FakeChessCom(exists=False)
    missing = client.post("/me/players/nobody123/save", headers=AUTH_HEADERS)
    assert missing.status_code == 404
    assert "nobody123" not in missing.json()["detail"]
    client.app.state.chesscom = FakeChessCom(status=503)
    assert client.post("/me/players/magnus/save", headers=AUTH_HEADERS).status_code == 502
    assert client.get("/me/players", headers=AUTH_HEADERS).json() == {"players": []}


def test_rate_limits_count_each_user_separately() -> None:
    client = _app(limit=2)
    for name in ("one11", "two22"):
        assert client.post(f"/me/players/{name}/save", headers=AUTH_HEADERS).status_code == 200
    limited = client.post("/me/players/three/save", headers=AUTH_HEADERS)
    assert limited.status_code == 429
    assert limited.headers["retry-after"]
    other = {**AUTH_HEADERS, "x-caissa-user": OTHER_USER}
    assert client.post("/me/players/three/save", headers=other).status_code == 200


def test_only_the_players_own_profile_and_archives_may_be_requested() -> None:
    assert is_allowed_archive_url("https://api.chess.com/pub/player/magnus", "magnus")
    assert is_allowed_archive_url("https://api.chess.com/pub/player/magnus/games/archives", "magnus")
    assert not is_allowed_archive_url("https://api.chess.com/pub/player/hikaru", "magnus")
    assert not is_allowed_archive_url("https://api.chess.com/pub/player/magnus/stats", "magnus")
    assert not is_allowed_archive_url("https://evil.example/pub/player/magnus", "magnus")
    assert not is_allowed_archive_url("http://api.chess.com/pub/player/magnus", "magnus")


@pytest.fixture
def redis_client() -> redis.Redis:
    client = redis.Redis.from_url("redis://localhost:6379/15")
    try:
        client.ping()
    except redis.exceptions.ConnectionError:
        pytest.skip("Redis is not running; the shared limiter was not checked")
    client.flushdb()
    yield client
    client.flushdb()


def test_the_redis_limiter_is_shared_between_processes(redis_client: redis.Redis) -> None:
    first = RedisSlidingWindowLimiter(redis_client, limit=2, window_seconds=60, prefix="test")
    second = RedisSlidingWindowLimiter(redis_client, limit=2, window_seconds=60, prefix="test")
    first.check("github:1")
    second.check("github:1")
    with pytest.raises(RateLimitExceeded) as raised:
        first.check("github:1")
    assert 1 <= raised.value.retry_after_seconds <= 61
    second.check("github:2")
