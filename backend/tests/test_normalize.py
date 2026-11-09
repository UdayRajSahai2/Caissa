from dataclasses import replace
from datetime import datetime, timezone

from app.domain.normalize import normalize_game, recent_archive_urls, select_for_analysis
from tests.samples import raw_game as _raw


def test_recent_archives_are_the_latest_months() -> None:
    urls = [f"https://api.chess.com/pub/player/hikaru/games/2024/{month:02d}" for month in range(1, 6)]
    assert recent_archive_urls(urls) == urls[-3:]


def test_normalize_reads_clock_color_and_result() -> None:
    game = normalize_game(_raw("abc"), "hikaru")
    assert game is not None
    assert game.chesscom_game_id == "abc"
    assert game.player_color == "white"
    assert game.result == "win"
    assert game.played_at == datetime.fromtimestamp(1_700_000_000, tz=timezone.utc)
    assert game.moves[0].san == "e4"
    assert game.moves[0].clock_seconds == 20
    assert game.moves[0].is_player_move is True
    assert game.moves[1].is_player_move is False
    assert "pgn" not in game.metadata


def test_bullet_games_are_excluded_unless_requested() -> None:
    games = [
        normalize_game(_raw("old", end_time=10), "hikaru"),
        normalize_game(_raw("bullet", time_class="bullet", end_time=30), "hikaru"),
        normalize_game(_raw("new", end_time=20), "hikaru"),
    ]
    assert all(game is not None for game in games)
    selected, excluded = select_for_analysis([game for game in games if game is not None], include_bullet=False)
    assert excluded == 1
    assert [game.chesscom_game_id for game in selected] == ["new", "old"]

    with_bullet, excluded_none = select_for_analysis(
        [game for game in games if game is not None],
        include_bullet=True,
    )
    assert excluded_none == 0
    assert [game.chesscom_game_id for game in with_bullet] == ["bullet", "new", "old"]


def test_games_that_cannot_be_read_are_skipped() -> None:
    assert normalize_game(_raw("abc"), "magnus") is None
    blank = _raw("abc")
    blank["pgn"] = "   "
    assert normalize_game(blank, "hikaru") is None
    missing = _raw("abc")
    del missing["pgn"]
    assert normalize_game(missing, "hikaru") is None
    nameless = _raw("abc")
    del nameless["uuid"]
    del nameless["url"]
    assert normalize_game(nameless, "hikaru") is None


def test_results_map_to_win_loss_draw_or_unknown() -> None:
    agreed = _raw("draw")
    agreed["white"]["result"] = "agreed"
    draw = normalize_game(agreed, "hikaru")
    assert draw is not None
    assert draw.result == "draw"

    mated = _raw("loss")
    mated["white"]["result"] = "checkmated"
    loss = normalize_game(mated, "hikaru")
    assert loss is not None
    assert loss.result == "loss"

    blank = _raw("unknown")
    blank["white"]["result"] = ""
    unknown = normalize_game(blank, "hikaru")
    assert unknown is not None
    assert unknown.result == "unknown"


def test_the_player_can_be_black_and_the_id_can_come_from_the_url() -> None:
    raw = _raw("from-url")
    del raw["uuid"]
    raw["white"] = {"username": "Opp", "result": "checkmated"}
    raw["black"] = {"username": "Hikaru", "result": "win"}
    raw["pgn"] = """[White "Opp"]
[Black "Hikaru"]
[Result "0-1"]

1. e4 {[%clk 1:02:03.9]} e5 {[%clk 0:09:40]}
"""
    game = normalize_game(raw, "hikaru")
    assert game is not None
    assert game.chesscom_game_id == "from-url"
    assert game.player_color == "black"
    assert game.result == "win"
    assert game.moves[0].is_player_move is False
    assert game.moves[0].clock_seconds == 3723
    assert game.moves[1].is_player_move is True


def test_duplicate_ids_collapse_to_the_newest_game() -> None:
    older = normalize_game(_raw("same", end_time=1), "hikaru")
    newer = normalize_game(_raw("same", end_time=5), "hikaru")
    dated = normalize_game(_raw("later"), "hikaru")
    assert older is not None and newer is not None and dated is not None
    undated = replace(dated, played_at=None, chesscom_game_id="undated")
    selected, excluded = select_for_analysis([older, newer, undated], include_bullet=False, limit=1)
    assert excluded == 0
    assert [game.chesscom_game_id for game in selected] == ["same"]
    assert selected[0].played_at == newer.played_at

    many, excluded_none = select_for_analysis([older, newer, undated], include_bullet=False)
    assert excluded_none == 0
    assert [game.chesscom_game_id for game in many] == ["same", "undated"]


def test_no_months_keeps_no_archives() -> None:
    assert recent_archive_urls(["https://api.chess.com/a", "https://api.chess.com/b"], months=0) == []
    assert recent_archive_urls(["only"], months=5) == ["only"]


def test_selection_stops_at_200_most_recent() -> None:
    games = []
    for index in range(205):
        game = normalize_game(_raw(f"g{index}", end_time=index + 1), "hikaru")
        assert game is not None
        games.append(game)
    selected, excluded = select_for_analysis(games, include_bullet=False)
    assert excluded == 0
    assert len(selected) == 200
    assert selected[0].chesscom_game_id == "g204"
