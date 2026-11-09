import chess

from app.domain.position import final_fen, opponent_name


def test_a_missing_opponent_name_uses_a_stand_in() -> None:
    assert opponent_name({}, "white") == "Opponent"
    assert opponent_name({"black": {"username": "   "}}, "white") == "Opponent"
    assert opponent_name({"black": {"username": "<script>alert(1)</script>"}}, "white") == "<script>alert(1)</script>"


def test_the_final_position_replays_the_last_move() -> None:
    fen = final_fen([(1, chess.STARTING_FEN, "e2e4")])
    assert fen.startswith("rnbqkbnr/pppppppp/8/8/4P3")


def test_a_game_with_no_moves_stays_on_the_starting_position() -> None:
    assert final_fen([]) == chess.STARTING_FEN
