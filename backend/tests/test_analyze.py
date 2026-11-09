from uuid import UUID

from fastapi.testclient import TestClient

from app.cache.reports import CachedReport, MemoryReportCache
from app.core.config import Settings
from app.jobs.status import MemoryJobBook
from app.main import create_app
from tests.auth_helpers import AUTH_HEADERS, TEST_TOKEN


class RecordingQueue:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bool, str]] = []

    def enqueue(self, username: str, include_bullet: bool, job_id: str) -> None:
        self.calls.append((username, include_bullet, job_id))


def _client(limit: int = 5, global_limit: int = 60) -> tuple[TestClient, RecordingQueue, MemoryReportCache]:
    settings = Settings(
        _env_file=None,
        internal_token=TEST_TOKEN,
        rate_limit_backend="memory",
        rate_limit_requests=limit,
        rate_limit_global_requests=global_limit,
        rate_limit_window_seconds=60,
        cors_origins=["http://localhost:3000"],
        enable_docs=False,
    )
    app = create_app(settings)
    queue = RecordingQueue()
    cache = MemoryReportCache()
    app.state.ingest_queue = queue
    app.state.report_cache = cache
    app.state.jobs = MemoryJobBook()
    return TestClient(app, headers=AUTH_HEADERS), queue, cache


def test_health_sends_security_headers() -> None:
    client, _queue, _cache = _client()
    with client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
    assert "default-src 'none'" in response.headers["content-security-policy"]


def test_analyze_enqueues_a_job_and_hides_game_text() -> None:
    client, queue, _cache = _client()
    with client:
        response = client.get("/analyze/hikaru")
    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "hikaru"
    assert body["status"] == "queued"
    UUID(body["job_id"])
    assert queue.calls == [("hikaru", False, body["job_id"])]
    assert "pgn" not in response.text
    assert "secret" not in response.text


def test_fresh_cache_does_not_enqueue() -> None:
    client, queue, cache = _client()
    cache.store(
        CachedReport(username="hikaru", job_id="job-1", generated_at="2026-01-01T00:00:00+00:00", game_count=4)
    )
    with client:
        response = client.get("/analyze/hikaru")
    assert response.status_code == 200
    assert response.json() == {"username": "hikaru", "job_id": "job-1", "status": "cached"}
    assert queue.calls == []


def test_a_second_request_reuses_the_active_job() -> None:
    client, queue, _cache = _client()
    with client:
        first = client.get("/analyze/hikaru").json()
        second = client.get("/analyze/hikaru").json()
    assert first["job_id"] == second["job_id"]
    assert len(queue.calls) == 1


def test_a_failed_job_does_not_block_the_next_run() -> None:
    client, queue, cache = _client()
    with client:
        first = client.get("/analyze/hikaru").json()
        client.app.state.jobs.update(first["job_id"], status="failed", error_message="Chess.com could not be reached.")
        second = client.get("/analyze/hikaru").json()
    assert second["job_id"] != first["job_id"]
    assert second["status"] == "queued"
    assert len(queue.calls) == 2
    assert cache.active_job("hikaru") == second["job_id"]


def test_a_succeeded_job_does_not_block_the_next_run() -> None:
    client, queue, cache = _client()
    with client:
        first = client.get("/analyze/hikaru").json()
        client.app.state.jobs.update(first["job_id"], status="succeeded", progress_pct=100)
        cache.forget_job("hikaru")
        second = client.get("/analyze/hikaru").json()
    assert second["job_id"] != first["job_id"]
    assert len(queue.calls) == 2
    assert cache.active_job("hikaru") == second["job_id"]


def test_a_foreign_origin_cannot_start_ingest() -> None:
    client, queue, _cache = _client()
    with client:
        response = client.get("/analyze/hikaru", headers={"Origin": "https://evil.example"})
    assert response.status_code == 403
    assert queue.calls == []
    assert "evil.example" not in response.text


def test_include_bullet_is_passed_to_the_job() -> None:
    client, queue, _cache = _client()
    with client:
        client.get("/analyze/hikaru", params={"include_bullet": True})
    assert queue.calls[0][1] is True


def test_job_progress_has_no_game_text() -> None:
    client, _queue, _cache = _client()
    with client:
        job_id = client.get("/analyze/hikaru").json()["job_id"]
        progress = client.get(f"/jobs/{job_id}")
        missing = client.get("/jobs/not-a-job")
    assert progress.status_code == 200
    assert progress.json()["status"] == "queued"
    assert progress.json()["error_message"] is None
    assert "pgn" not in progress.text
    assert missing.status_code == 404
    assert missing.json()["detail"] == "No analysis job was found with that id."


def test_invalid_username_never_enqueues() -> None:
    client, queue, _cache = _client()
    with client:
        response = client.get("/analyze/no.pe")
    assert response.status_code == 422
    assert response.json()["detail"] == "Chess.com username is not valid."
    assert "no.pe" not in response.text
    assert queue.calls == []


def test_an_invalid_username_does_not_spend_the_rate_limit() -> None:
    client, queue, _cache = _client(limit=1)
    with client:
        rejected = client.get("/analyze/no")
        allowed = client.get("/analyze/hikaru")
    assert rejected.status_code == 422
    assert allowed.status_code == 200
    assert queue.calls == [("hikaru", False, allowed.json()["job_id"])]


def test_a_foreign_origin_does_not_spend_the_rate_limit() -> None:
    client, queue, _cache = _client(limit=1)
    with client:
        blocked = client.get("/analyze/hikaru", headers={"Origin": "https://evil.example"})
        allowed = client.get("/analyze/hikaru")
    assert blocked.status_code == 403
    assert allowed.status_code == 200
    assert len(queue.calls) == 1


def test_rate_limit_is_per_address() -> None:
    client, _queue, _cache = _client(limit=2)
    with client:
        assert client.get("/analyze/hikaru").status_code == 200
        assert client.get("/analyze/hikaru").status_code == 200
        blocked = client.get("/analyze/hikaru")
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"]
    assert "Too many analysis requests" in blocked.json()["detail"]


def test_global_rate_limit_caps_all_addresses() -> None:
    client, _queue, _cache = _client(limit=10, global_limit=2)
    with client:
        assert client.get("/analyze/hikaru").status_code == 200
        assert client.get("/analyze/another1").status_code == 200
        blocked = client.get("/analyze/another2")
    assert blocked.status_code == 429
    assert "busy with analysis requests" in blocked.json()["detail"]


def test_cors_allows_only_the_configured_origin() -> None:
    client, _queue, _cache = _client()
    with client:
        allowed = client.get("/health", headers={"Origin": "http://localhost:3000"})
        rejected = client.get("/health", headers={"Origin": "https://evil.example"})
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-origin" not in rejected.headers
