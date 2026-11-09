import pytest

from app.adapters.chess.chesscom import ChessComError
from app.worker.tasks import analyze_game, ingest_player


class RecordingBook:
    def __init__(self) -> None:
        self.updates: list[dict[str, object]] = []
        self.released: list[str] = []

    def update(self, job_id: str, **fields: object) -> None:
        self.updates.append({"job_id": job_id, **fields})

    def release_game(self, game_id: str) -> None:
        self.released.append(game_id)

    def mark_game_finished(self, job_id: str) -> None:
        raise AssertionError(f"job {job_id} should have failed")


def _patch_jobs(monkeypatch: pytest.MonkeyPatch, book: RecordingBook) -> None:
    monkeypatch.setattr("app.worker.tasks._jobs", lambda settings: book)
    monkeypatch.setattr("app.worker.tasks._forget_active", lambda settings, username: None)


def test_a_429_stays_running_until_the_last_retry_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    book = RecordingBook()
    _patch_jobs(monkeypatch, book)

    def fail(coro: object) -> None:
        close = getattr(coro, "close", None)
        if close is not None:
            close()
        raise ChessComError(429)

    monkeypatch.setattr("app.worker.tasks.asyncio.run", fail)
    # Called directly, Celery's retry re-raises the original error. The job stays running.
    with pytest.raises(ChessComError):
        ingest_player.run("hikaru", False, "job-1", None, False)
    assert book.updates == [{"job_id": "job-1", "status": "running"}]

    ingest_player.push_request(retries=ingest_player.max_retries)
    try:
        result = ingest_player.run("hikaru", False, "job-1", None, False)
    finally:
        ingest_player.pop_request()
    assert result == {"status": "failed"}
    assert book.updates[-1]["status"] == "failed"
    assert book.updates[-1]["error_message"] == "Chess.com is limiting requests. Try again shortly."


def test_an_unexpected_scoring_error_marks_the_job_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    book = RecordingBook()
    _patch_jobs(monkeypatch, book)

    class Session:
        def __init__(self) -> None:
            self.closed = False

        def close(self) -> None:
            self.closed = True

    session = Session()
    monkeypatch.setattr("app.worker.tasks.session_factory", lambda: (lambda: session))
    monkeypatch.setattr("app.worker.tasks.StockfishEngine", lambda path, depth: object())

    def explode(internal_id: str, store: object, engine: object) -> dict[str, object]:
        del internal_id, store, engine
        raise ValueError("pgn exploded")

    monkeypatch.setattr("app.worker.tasks.analyze_stored_game", explode)
    result = analyze_game.run("12", "job-9")
    assert result == {"status": "failed"}
    assert session.closed is True
    assert book.released == ["12"]
    assert book.updates[-1]["status"] == "failed"
    assert book.updates[-1]["error_message"] == "Caissa could not score that game. Try again."
