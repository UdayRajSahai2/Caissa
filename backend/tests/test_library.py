from datetime import datetime, timezone

import chess
from fastapi.testclient import TestClient

from app.cache.reports import MemoryReportCache
from app.core.config import Settings
from app.db.memory import MemoryGameStore
from app.domain.blunder import MoveJudgement
from app.domain.normalize import NormalizedGame, NormalizedMove
from app.engine.stockfish import AnalyzedMove
from app.jobs.status import MemoryJobBook
from app.main import create_app
from tests.auth_helpers import AUTH_HEADERS, TEST_TOKEN


class RecordingQueue:
    def __init__(self) -> None:
        self.calls: list[tuple] = []

    def enqueue(
        self,
        username: str,
        include_bullet: bool,
        job_id: str,
        needed: int | None = None,
        refresh_latest: bool = False,
    ) -> None:
        self.calls.append((username, include_bullet, job_id, needed, refresh_latest))

    def enqueue_game(self, internal_id: str, job_id: str) -> None:
        self.calls.append((internal_id, job_id))


def _client(
    store: MemoryGameStore | None = None,
    limit: int = 20,
) -> tuple[TestClient, RecordingQueue, RecordingQueue]:
    settings = Settings(
        _env_file=None,
        internal_token=TEST_TOKEN,
        rate_limit_backend="memory",
        rate_limit_requests=limit,
        rate_limit_global_requests=60,
        cors_origins=["http://localhost:3000"],
        enable_docs=False,
    )
    app = create_app(settings)
    ingest = RecordingQueue()
    analysis = RecordingQueue()
    app.state.ingest_queue = ingest
    app.state.analysis_queue = analysis
    app.state.jobs = MemoryJobBook()
    app.state.report_cache = MemoryReportCache()
    app.state.game_store = store if store is not None else MemoryGameStore()
    return TestClient(app, headers=AUTH_HEADERS), ingest, analysis


def _game(game_id: str, day: int, result: str) -> NormalizedGame:
    return NormalizedGame(
        chesscom_game_id=game_id,
        pgn="1. e4 *",
        time_control="180",
        time_class="blitz",
        result=result,
        played_at=datetime(2026, 10, day, tzinfo=timezone.utc),
        player_color="white",
        moves=(NormalizedMove(1, "e4", "e2e4", chess.STARTING_FEN, None, True),),
        metadata={"white": {"username": "hikaru"}, "black": {"username": "bob"}},
    )


def test_the_app_origin_can_queue_a_fetch() -> None:
    client, ingest, analysis = _client()
    with client:
        response = client.get("/library/hikaru", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    assert len(ingest.calls) == 1
    assert analysis.calls == []


def test_a_second_library_sync_reuses_the_open_ingest() -> None:
    client, ingest, _analysis = _client()
    with client:
        first = client.get("/library/hikaru").json()
        second = client.get("/library/hikaru").json()
    assert first["job_id"] == second["job_id"]
    assert first["status"] == "queued"
    assert second["status"] == "queued"
    assert len(ingest.calls) == 1


def test_library_queues_a_fetch_and_does_not_score() -> None:
    client, ingest, analysis = _client()
    with client:
        response = client.get("/library/hikaru")
    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "queued"
    assert body["username"] == "hikaru"
    assert ingest.calls == [("hikaru", False, body["job_id"], 10, False)]
    assert analysis.calls == []


def test_same_username_is_ready_without_another_download() -> None:
    store = MemoryGameStore()
    for day in range(1, 11):
        store.ensure_games("hikaru", [_game(f"g{day}", day, "win")])
    client, ingest, _analysis = _client(store)
    with client:
        response = client.get("/library/hikaru")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["job_id"] is None
    assert ingest.calls == []
    assert store.game_count("hikaru") == 10


def test_a_stale_page_is_shown_at_once_while_the_latest_month_is_checked() -> None:
    store = MemoryGameStore()
    for day in range(1, 11):
        store.ensure_games("hikaru", [_game(f"g{day}", day, "win")])
    store.synced_at["hikaru"] = datetime(2026, 10, 17, tzinfo=timezone.utc)
    client, ingest, _analysis = _client(store)
    with client:
        response = client.get("/library/hikaru")
    body = response.json()
    assert response.status_code == 200
    assert body["status"] == "refreshing"
    assert body["job_id"]
    assert ingest.calls == [("hikaru", False, body["job_id"], 10, True)]
    assert store.game_count("hikaru") == 10


def test_games_page_is_newest_first_and_hides_pgn() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("old", 1, "loss"), _game("new", 3, "win")])
    client, _ingest, _analysis = _client(store)
    with client:
        response = client.get("/library/hikaru/games", params={"page": 1, "page_size": 1})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["games"]) == 1
    assert body["games"][0]["result"] == "win"
    assert body["games"][0]["opponent"] == "bob"
    assert body["games"][0]["final_fen"].startswith("rnbqkbnr/pppppppp/8/8/4P3")
    assert "pgn" not in response.text


def test_opening_a_game_queues_only_that_game() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    client, _ingest, analysis = _client(store)
    with client:
        listed = client.get("/library/hikaru/games").json()
        game_id = listed["games"][0]["id"]
        response = client.post(f"/games/{game_id}/analyze")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert analysis.calls == [(game_id, body["job_id"])]


def test_a_second_score_reuses_the_open_job() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    client, _ingest, analysis = _client(store)
    with client:
        game_id = client.get("/library/hikaru/games").json()["games"][0]["id"]
        first = client.post(f"/games/{game_id}/analyze")
        second = client.post(f"/games/{game_id}/analyze")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["job_id"] == second.json()["job_id"]
    assert analysis.calls == [(game_id, first.json()["job_id"])]


def test_get_does_not_start_analysis() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    client, _ingest, analysis = _client(store)
    with client:
        game_id = client.get("/library/hikaru/games").json()["games"][0]["id"]
        response = client.get(f"/games/{game_id}/analyze")
    assert response.status_code == 405
    assert analysis.calls == []


def test_a_foreign_origin_cannot_start_ingest_or_analysis() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    client, ingest, analysis = _client(store)
    foreign = {"Origin": "https://evil.example"}
    with client:
        game_id = client.get("/library/hikaru/games").json()["games"][0]["id"]
        library = client.get("/library/nobody1", headers=foreign)
        score = client.post(f"/games/{game_id}/analyze", headers=foreign)
    assert library.status_code == 403
    assert score.status_code == 403
    assert library.json()["detail"] == "This action is only available from the Caissa app."
    assert "evil.example" not in library.text
    assert ingest.calls == []
    assert analysis.calls == []


def test_scoring_another_game_is_rate_limited() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("one", 1, "win"), _game("two", 2, "loss")])
    client, _ingest, analysis = _client(store, limit=1)
    with client:
        ids = [game["id"] for game in client.get("/library/hikaru/games").json()["games"]]
        first = client.post(f"/games/{ids[0]}/analyze")
        second = client.post(f"/games/{ids[1]}/analyze")
    assert first.status_code == 200
    assert second.status_code == 429
    assert second.headers["retry-after"]
    assert len(analysis.calls) == 1


def test_missing_game_is_not_echoed() -> None:
    client, _ingest, analysis = _client(MemoryGameStore())
    with client:
        response = client.post("/games/999/analyze")
    assert response.status_code == 404
    assert response.json()["detail"] == "That game was not found."
    assert "999" not in response.text
    assert analysis.calls == []


def test_an_invalid_library_username_does_not_spend_the_rate_limit() -> None:
    client, ingest, _analysis = _client(limit=1)
    with client:
        rejected = client.get("/library/no")
        allowed = client.get("/library/hikaru")
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "Chess.com username is not valid."
    assert allowed.status_code == 200
    assert len(ingest.calls) == 1


def test_a_foreign_origin_does_not_spend_the_library_limit() -> None:
    client, ingest, _analysis = _client(limit=1)
    with client:
        blocked = client.get("/library/hikaru", headers={"Origin": "https://evil.example/"})
        allowed = client.get("/library/hikaru")
    assert blocked.status_code == 403
    assert "evil.example" not in blocked.text
    assert allowed.status_code == 200
    assert len(ingest.calls) == 1


def test_a_page_outside_the_allowed_range_is_rejected() -> None:
    client, ingest, _analysis = _client()
    with client:
        low = client.get("/library/hikaru/games", params={"page": 0})
        high = client.get("/library/hikaru/games", params={"page": 101})
        huge = client.get("/library/hikaru/games", params={"page_size": 21})
    assert low.status_code == 422
    assert high.status_code == 422
    assert huge.status_code == 422
    assert ingest.calls == []


def test_an_overlong_game_id_is_a_missing_game() -> None:
    client, _ingest, analysis = _client()
    quiet = TestClient(client.app, raise_server_exceptions=False, headers=AUTH_HEADERS)
    with quiet:
        too_long = quiet.post(f"/games/{'1' * 13}/analyze")
        padded = quiet.get("/games/000000000000")
    assert too_long.status_code == 404
    assert too_long.json()["detail"] == "That game was not found."
    assert padded.status_code == 404
    assert analysis.calls == []


def test_a_scored_game_returns_the_better_move_without_another_job() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    game_id = store.list_games("hikaru", 1, 10)[1][0].id
    store.save_analysis(game_id, [_analyzed("g1f3")])
    client, _ingest, analysis = _client(store)
    with client:
        score = client.post(f"/games/{game_id}/analyze")
        detail = client.get(f"/games/{game_id}")
    assert score.status_code == 200
    assert score.json()["status"] == "ready"
    assert analysis.calls == []
    note = detail.json()["blunders"][0]
    assert note["played_uci"] == "e2e4"
    assert note["best_uci"] == "g1f3"
    assert note["best_san"] == "Nf3"
    assert "pgn" not in detail.text
    # REV-01: every move comes back for the game review, with its eval and labels' inputs.
    assert detail.json()["moves"] == [
        {
            "ply": 1,
            "san": "e4",
            "uci": "e2e4",
            "fen_before": chess.STARTING_FEN,
            "best_uci": "g1f3",
            "best_san": "Nf3",
            "eval_cp": -100,
            "eval_mate": None,
            "clock_seconds": None,
            "is_player_move": True,
            "is_blunder": True,
        }
    ]


def test_a_scored_game_missing_the_better_move_is_queued_again() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    game_id = store.list_games("hikaru", 1, 10)[1][0].id
    store.save_analysis(game_id, [_analyzed(None)])
    client, _ingest, analysis = _client(store)
    with client:
        score = client.post(f"/games/{game_id}/analyze")
    assert score.status_code == 200
    assert score.json()["status"] == "queued"
    assert analysis.calls == [(game_id, score.json()["job_id"])]


def _analyzed(best_uci: str | None) -> AnalyzedMove:
    return AnalyzedMove(
        ply=1,
        san="e4",
        uci="e2e4",
        fen_before=chess.STARTING_FEN,
        clock_seconds=None,
        is_player_move=True,
        judgement=MoveJudgement(
            eval_cp=-100,
            eval_mate=None,
            is_blunder=True,
            blunder_severity_cp=200,
            phase="opening",
            board_region="e4",
            under_time_pressure=False,
        ),
        best_uci=best_uci,
    )


def test_the_library_report_counts_scored_games_and_queues_the_rest() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("one", 2, "win"), _game("two", 3, "loss")])
    cards = store.list_games("hikaru", 1, 10)[1]
    scored = cards[0].id
    waiting = cards[1].id
    store.save_analysis(scored, [_analyzed("g1f3")])
    client, _ingest, analysis = _client(store)
    with client:
        report = client.get("/library/hikaru/report")
        score = client.post("/library/hikaru/analyze")
        again = client.post("/library/hikaru/analyze")
    assert report.status_code == 200
    body = report.json()
    assert body["games_total"] == 2
    assert body["games_analyzed"] == 1
    assert body["games_scored"] == 1
    assert body["blunders"][0]["game_id"] == scored
    assert body["blunders"][0]["square"] == "e4"
    assert body["blunders"][0]["best_uci"] == "g1f3"
    assert score.status_code == 200
    assert score.json()["queued"] == 1
    assert score.json()["status"] == "queued"
    job_id = score.json()["job_id"]
    assert analysis.calls == [(waiting, job_id)]
    job = client.app.state.jobs.get(job_id)
    assert job is not None
    assert job.games_total == 1
    assert job.games_done == 0
    assert again.json()["queued"] == 0
    assert len(analysis.calls) == 1


def test_an_invalid_username_is_rejected_for_the_library_report() -> None:
    client, _ingest, analysis = _client()
    with client:
        report = client.get("/library/no/report")
        score = client.post("/library/no/analyze")
    assert report.status_code == 422
    assert report.json()["detail"] == "Chess.com username is not valid."
    assert score.status_code == 422
    assert score.json()["detail"] == "Chess.com username is not valid."
    assert analysis.calls == []


def test_an_unknown_player_has_an_empty_library_report() -> None:
    client, _ingest, analysis = _client()
    with client:
        response = client.get("/library/hikaru/report")
        score = client.post("/library/hikaru/analyze")
    assert response.status_code == 200
    assert response.json() == {
        "username": "hikaru",
        "games_total": 0,
        "games_analyzed": 0,
        "games_scored": 0,
        "blunders": [],
    }
    assert score.json()["status"] == "ready"
    assert score.json()["queued"] == 0
    assert analysis.calls == []


def test_a_unicode_digit_game_id_is_a_missing_game() -> None:
    client, _ingest, analysis = _client()
    quiet = TestClient(client.app, raise_server_exceptions=False, headers=AUTH_HEADERS)
    with quiet:
        superscript = quiet.post("/games/\u00b2/analyze")
        fullwidth = quiet.post("/games/\uff11/analyze")
    assert superscript.status_code == 404
    assert superscript.json()["detail"] == "That game was not found."
    assert fullwidth.status_code == 404
    assert analysis.calls == []


def _reply(best_uci: str | None) -> AnalyzedMove:
    after_e4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    return AnalyzedMove(
        ply=2,
        san="e5",
        uci="e7e5",
        fen_before=after_e4,
        clock_seconds=None,
        is_player_move=False,
        judgement=MoveJudgement(
            eval_cp=0,
            eval_mate=None,
            is_blunder=False,
            blunder_severity_cp=0,
            phase="opening",
            board_region="e5",
            under_time_pressure=False,
        ),
        best_uci=best_uci,
    )


def test_a_blunder_carries_the_engine_reply_that_punishes_it() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    game_id = store.list_games("hikaru", 1, 10)[1][0].id
    store.save_analysis(game_id, [_analyzed("g1f3"), _reply("d7d5")])
    client, _ingest, _analysis = _client(store)
    with client:
        detail = client.get(f"/games/{game_id}")
        report = client.get("/library/hikaru/report")
    for note in (detail.json()["blunders"][0], report.json()["blunders"][0]):
        assert note["reply_uci"] == "d7d5"
        assert note["reply_san"] == "d5"


def test_a_blunder_on_the_last_move_has_no_reply() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game("only", 2, "draw")])
    game_id = store.list_games("hikaru", 1, 10)[1][0].id
    store.save_analysis(game_id, [_analyzed("g1f3")])
    client, _ingest, _analysis = _client(store)
    with client:
        note = client.get(f"/games/{game_id}").json()["blunders"][0]
    assert note["reply_uci"] == ""
    assert note["reply_san"] == ""


def test_large_responses_are_compressed_and_keep_security_headers() -> None:
    store = MemoryGameStore()
    store.ensure_games("hikaru", [_game(f"g{index}", 2, "draw") for index in range(20)])
    client, _ingest, _analysis = _client(store)
    with client:
        page = client.get("/library/hikaru/games?page_size=20", headers={"Accept-Encoding": "gzip"})
    assert page.status_code == 200
    assert page.headers["content-encoding"] == "gzip"
    assert page.headers["x-content-type-options"] == "nosniff"
    assert page.json()["total"] == 20


def test_move_names_are_read_from_one_board_and_survive_bad_input() -> None:
    from app.db.cards import move_names

    start = chess.STARTING_FEN
    assert move_names(start, "e2e4", "g1f3", "d7d5") == ("Nf3", "d5")
    assert move_names(start, "e2e4", "", "") == ("", "")
    assert move_names("not a fen", "e2e4", "g1f3", "d7d5") == ("", "")
    assert move_names(start, "zz", "g1f3", "d7d5") == ("Nf3", "")
