import httpx
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.adapters.chess.chesscom import ChessComClient, ChessComError
from app.db.memory import MemoryGameStore
from app.db.models import Base, Blunder, Move
from app.db.repository import SqlGameStore
from app.domain.blunder import PositionEval
from app.domain.normalize import normalize_game
from app.engine.stockfish import evaluate_game
from app.services.analyze import analyze_stored_game
from app.services.ingest import ingest_player
from tests.samples import raw_game as _raw

MONTHS = [
    "https://api.chess.com/pub/player/hikaru/games/2024/01",
    "https://api.chess.com/pub/player/hikaru/games/2024/02",
    "https://api.chess.com/pub/player/hikaru/games/2024/03",
    "https://api.chess.com/pub/player/hikaru/games/2024/04",
]


class FakeSource:
    def __init__(self) -> None:
        self.fetched: list[str] = []

    async def list_archive_urls(self, username: str) -> list[str]:
        return MONTHS

    async def fetch_month_games(self, archive_url: str, username: str) -> list[dict]:
        self.fetched.append(archive_url)
        if archive_url.endswith("/02"):
            return [_raw("bullet-1", time_class="bullet", end_time=50)]
        if archive_url.endswith("/04"):
            return [_raw("rapid-1", end_time=80), _raw("rapid-1", end_time=80)]
        return [_raw("rapid-old", end_time=10)]


class ScriptedEngine:
    def __init__(self, scores: list[PositionEval]) -> None:
        self._scores = scores
        self.closed = False

    def evaluate(self, board: object) -> PositionEval:
        del board
        return self._scores.pop(0)

    def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_ingest_uses_recent_months_and_skips_bullet_and_duplicates() -> None:
    source = FakeSource()
    store = MemoryGameStore()
    first = await ingest_player(username="hikaru", include_bullet=False, source=source, store=store)
    assert source.fetched == MONTHS[-3:]
    assert first.bullet_excluded == 1
    assert first.selected == 2
    assert first.pending_ids

    for internal_id in first.pending_ids:
        store.save_analysis(internal_id, [])
    second = await ingest_player(username="hikaru", include_bullet=False, source=source, store=store)
    assert second.pending_ids == []
    assert second.already_stored == 2


@pytest.mark.asyncio
async def test_a_page_downloads_only_new_months_and_does_not_duplicate() -> None:
    source = FakeSource()
    store = MemoryGameStore()
    await ingest_player(username="hikaru", include_bullet=False, source=source, store=store, needed=1)
    assert source.fetched == [MONTHS[-1]]
    assert store.game_count("hikaru") == 1

    await ingest_player(username="hikaru", include_bullet=False, source=source, store=store, needed=1)
    assert source.fetched == [MONTHS[-1]]
    assert store.game_count("hikaru") == 1


class ManyGames:
    def __init__(self) -> None:
        self.fetched: list[str] = []

    async def list_archive_urls(self, username: str) -> list[str]:
        return MONTHS[-1:]

    async def fetch_month_games(self, archive_url: str, username: str) -> list[dict]:
        self.fetched.append(archive_url)
        return [_raw(f"g{i}", end_time=100 + i) for i in range(6)]


@pytest.mark.asyncio
async def test_first_page_stores_ten_games_not_the_whole_month() -> None:
    source = ManyGames()
    store = MemoryGameStore()
    await ingest_player(username="hikaru", include_bullet=False, source=source, store=store, needed=2)
    assert store.game_count("hikaru") == 2
    assert store.fetched_archives("hikaru") == []


@pytest.mark.asyncio
async def test_refresh_stores_games_played_after_the_saved_ones() -> None:
    source = ManyGames()
    store = MemoryGameStore()
    already = normalize_game(_raw("g5", end_time=105), "hikaru")
    assert already is not None
    store.ensure_games("hikaru", [already])
    await ingest_player(
        username="hikaru",
        include_bullet=False,
        source=source,
        store=store,
        refresh_latest=True,
    )
    assert source.fetched == MONTHS[-1:]
    assert store.game_count("hikaru") == 6
    assert store.fetched_archives("hikaru") == []


class OverflowMonth:
    async def list_archive_urls(self, username: str) -> list[str]:
        return MONTHS[-1:]

    async def fetch_month_games(self, archive_url: str, username: str) -> list[dict]:
        del archive_url, username
        return [_raw(f"g{index}", end_time=index + 1) for index in range(201)]


@pytest.mark.asyncio
async def test_refresh_stores_every_new_game_in_the_month() -> None:
    store = MemoryGameStore()
    await ingest_player(
        username="hikaru",
        include_bullet=False,
        source=OverflowMonth(),
        store=store,
        refresh_latest=True,
    )
    assert store.game_count("hikaru") == 201


def test_two_players_each_keep_a_shared_chesscom_game() -> None:
    white = normalize_game(_raw("shared"), "hikaru")
    black = normalize_game(_raw("shared"), "opp")
    assert white is not None
    assert black is not None

    memory = MemoryGameStore()
    memory.ensure_games("hikaru", [white])
    memory.ensure_games("opp", [black])
    assert memory.game_count("hikaru") == 1
    assert memory.game_count("opp") == 1
    hikaru_id = memory.list_games("hikaru", 1, 10)[1][0].id
    opp_id = memory.list_games("opp", 1, 10)[1][0].id
    assert hikaru_id != opp_id

    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    store = SqlGameStore(session)
    store.ensure_games("hikaru", [white])
    store.ensure_games("opp", [black])
    assert store.game_count("hikaru") == 1
    assert store.game_count("opp") == 1
    assert store.list_games("hikaru", 1, 10)[1][0].id != store.list_games("opp", 1, 10)[1][0].id
    session.close()


def test_scripted_engine_persists_the_player_blunder() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    store = SqlGameStore(session)
    game = normalize_game(_raw("known-game"), "hikaru")
    assert game is not None
    pending = store.ensure_games("hikaru", [game])
    scripted = ScriptedEngine(
        [
            PositionEval(cp_white=300, mate_white=None, best_uci="g1f3"),
            PositionEval(cp_white=-100, mate_white=None),
            PositionEval(cp_white=-80, mate_white=None),
        ]
    )
    outcome = analyze_stored_game(pending[0], store, scripted)
    assert outcome == {"game_id": pending[0], "status": "success", "blunders": 1}
    assert scripted.closed is True

    blunder = session.scalar(select(Blunder))
    assert blunder is not None
    assert blunder.phase == "opening"
    assert blunder.under_time_pressure is True
    move = session.get(Move, blunder.move_id)
    assert move is not None
    assert move.board_region == "e4"
    assert move.eval_cp == -100
    assert move.is_player_move is True
    assert move.best_uci == "g1f3"
    detail = store.game_detail(pending[0])
    assert detail is not None
    assert detail.blunders[0].played_uci == "e2e4"
    assert detail.blunders[0].best_uci == "g1f3"
    assert detail.blunders[0].best_san == "Nf3"
    assert detail.blunders[0].fen.startswith("rnbqkbnr")
    assert [(m.ply, m.san, m.best_uci, m.eval_cp, m.is_blunder) for m in detail.moves] == [
        (1, "e4", "g1f3", -100, True),
        (2, "e5", "", -80, False),
    ]

    again = analyze_stored_game(pending[0], store, ScriptedEngine([]))
    assert again["status"] == "already_processed"


def test_a_blunder_scored_before_suggestions_is_scored_once_more() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    store = SqlGameStore(session)
    game = normalize_game(_raw("known-game"), "hikaru")
    assert game is not None
    pending = store.ensure_games("hikaru", [game])
    analyze_stored_game(
        pending[0],
        store,
        ScriptedEngine(
            [
                PositionEval(cp_white=300, mate_white=None),
                PositionEval(cp_white=-100, mate_white=None),
                PositionEval(cp_white=-80, mate_white=None),
            ]
        ),
    )
    stored = session.scalar(select(Move).where(Move.is_blunder.is_(True)))
    assert stored is not None
    assert stored.best_uci == ""
    assert store.suggestions_ready(pending[0]) is True
    stored.best_uci = None
    session.commit()
    assert store.suggestions_ready(pending[0]) is False

    again = analyze_stored_game(
        pending[0],
        store,
        ScriptedEngine(
            [
                PositionEval(cp_white=300, mate_white=None, best_uci="g1f3"),
                PositionEval(cp_white=-100, mate_white=None),
                PositionEval(cp_white=-80, mate_white=None),
            ]
        ),
    )
    assert again["status"] == "success"
    rows = session.scalars(select(Blunder)).all()
    assert len(rows) == 1
    move = session.get(Move, rows[0].move_id)
    assert move is not None
    assert move.best_uci == "g1f3"


def test_evaluate_game_uses_one_score_per_position() -> None:
    game = normalize_game(_raw("known-game"), "hikaru")
    assert game is not None
    scripted = ScriptedEngine(
        [
            PositionEval(cp_white=10, mate_white=None, best_uci="e2e4"),
            PositionEval(cp_white=10, mate_white=None, best_uci="e7e5"),
            PositionEval(cp_white=10, mate_white=None),
        ]
    )
    analyzed = evaluate_game(game.pgn, game.player_color, scripted, {1: 20, 2: 580})
    assert [move.judgement.is_blunder for move in analyzed] == [False, False]
    assert [move.best_uci for move in analyzed] == ["e2e4", "e7e5"]
    assert scripted._scores == []


@pytest.mark.asyncio
async def test_case_redirect_is_followed_only_on_the_allowlist() -> None:
    mixed = "https://api.chess.com/pub/player/Hikaru/games/2024/04"
    canonical = "https://api.chess.com/pub/player/hikaru/games/2024/04"
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if str(request.url) == mixed:
            return httpx.Response(301, headers={"location": canonical})
        return httpx.Response(200, json={"games": []})

    async with ChessComClient("Caissa-test", 5.0, transport=httpx.MockTransport(handler)) as client:
        assert await client.fetch_month_games(mixed, "hikaru") == []
    assert seen == [mixed, canonical]

    def evil(request: httpx.Request) -> httpx.Response:
        if "evil" in str(request.url):
            raise AssertionError("redirect host was requested")
        return httpx.Response(301, headers={"location": "https://evil.example/steal"})

    async with ChessComClient("Caissa-test", 5.0, transport=httpx.MockTransport(evil)) as client:
        with pytest.raises(ChessComError):
            await client.fetch_month_games(MONTHS[-1], "hikaru")


@pytest.mark.asyncio
async def test_rate_limit_backs_off_without_leaking_the_body() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 3:
            return httpx.Response(429, json={"secret": "do-not-leak"})
        return httpx.Response(200, json={"archives": []})

    slept: list[float] = []

    async def sleep(seconds: float) -> None:
        slept.append(seconds)

    async with ChessComClient("Caissa-test", 5.0, transport=httpx.MockTransport(handler), sleep=sleep) as client:
        urls = await client.list_archive_urls("hikaru")
    assert urls == []
    assert calls == 3
    assert slept == [0.5, 1.0]
