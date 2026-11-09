from app.jobs.status import MemoryJobBook, SCORE_CLAIM_TTL_SECONDS


def test_mark_game_finished_does_not_clear_a_failed_batch() -> None:
    book = MemoryJobBook()
    book.create("job-1", "hikaru")
    book.update("job-1", status="queued", games_total=2, games_done=0)
    book.update("job-1", status="failed", error_message="Stockfish is not configured on this machine.")

    state = book.mark_game_finished("job-1")

    assert state is not None
    assert state.status == "failed"
    assert state.error_message == "Stockfish is not configured on this machine."
    assert state.games_done == 1
    assert book.get("job-1") is not None
    assert book.get("job-1").status == "failed"


def test_mark_game_finished_still_succeeds_a_healthy_batch() -> None:
    book = MemoryJobBook()
    book.create("job-2", "hikaru")
    book.update("job-2", status="queued", games_total=2, games_done=0)

    first = book.mark_game_finished("job-2")
    second = book.mark_game_finished("job-2")

    assert first is not None and first.status == "running"
    assert second is not None and second.status == "succeeded"
    assert second.games_done == 2
    assert second.progress_pct == 100


def test_score_claim_ttl_is_shorter_than_a_day() -> None:
    assert SCORE_CLAIM_TTL_SECONDS == 15 * 60
    assert SCORE_CLAIM_TTL_SECONDS < 60 * 60
