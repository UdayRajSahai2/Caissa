from app.domain.blunder import PositionEval, judge_move, phase_for

START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"


def test_a_150_centipawn_drop_by_the_player_is_a_blunder() -> None:
    judgement = judge_move(
        fen_before=START,
        uci="e2e4",
        ply=1,
        clock_seconds=20,
        is_player_move=True,
        before=PositionEval(cp_white=300, mate_white=None),
        after=PositionEval(cp_white=-100, mate_white=None),
    )
    assert judgement.is_blunder is True
    assert judgement.blunder_severity_cp == 400
    assert judgement.board_region == "e4"
    assert judgement.phase == "opening"
    assert judgement.under_time_pressure is True
    assert judgement.eval_cp == -100


def test_a_small_drop_and_an_opponent_move_are_not_blunders() -> None:
    quiet = judge_move(
        fen_before=START,
        uci="e2e4",
        ply=1,
        clock_seconds=20,
        is_player_move=True,
        before=PositionEval(cp_white=40, mate_white=None),
        after=PositionEval(cp_white=20, mate_white=None),
    )
    opponent = judge_move(
        fen_before="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        uci="e7e5",
        ply=2,
        clock_seconds=10,
        is_player_move=False,
        before=PositionEval(cp_white=20, mate_white=None),
        after=PositionEval(cp_white=400, mate_white=None),
    )
    assert quiet.is_blunder is False
    assert quiet.under_time_pressure is False
    assert opponent.is_blunder is False


def test_150_centipawns_is_a_blunder_and_30_seconds_is_not_time_pressure() -> None:
    exact = judge_move(
        fen_before=START,
        uci="e2e4",
        ply=1,
        clock_seconds=30,
        is_player_move=True,
        before=PositionEval(cp_white=150, mate_white=None),
        after=PositionEval(cp_white=0, mate_white=None),
    )
    just_under = judge_move(
        fen_before=START,
        uci="e2e4",
        ply=1,
        clock_seconds=29,
        is_player_move=True,
        before=PositionEval(cp_white=149, mate_white=None),
        after=PositionEval(cp_white=0, mate_white=None),
    )
    assert exact.is_blunder is True
    assert exact.blunder_severity_cp == 150
    assert exact.under_time_pressure is False
    assert just_under.is_blunder is False
    assert just_under.under_time_pressure is False


def test_a_black_move_that_loses_200_centipawns_is_a_blunder() -> None:
    black_to_move = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    judgement = judge_move(
        fen_before=black_to_move,
        uci="e7e5",
        ply=2,
        clock_seconds=90,
        is_player_move=True,
        before=PositionEval(cp_white=0, mate_white=None),
        after=PositionEval(cp_white=200, mate_white=None),
    )
    assert judgement.is_blunder is True
    assert judgement.blunder_severity_cp == 200
    assert judgement.phase == "opening"
    assert judgement.under_time_pressure is False


def test_walking_into_mate_is_a_blunder_for_the_player_only() -> None:
    walked_in = judge_move(
        fen_before=START,
        uci="f2f3",
        ply=1,
        clock_seconds=None,
        is_player_move=True,
        before=PositionEval(cp_white=100, mate_white=None),
        after=PositionEval(cp_white=None, mate_white=-3),
    )
    opponent = judge_move(
        fen_before=START,
        uci="f2f3",
        ply=1,
        clock_seconds=5,
        is_player_move=False,
        before=PositionEval(cp_white=100, mate_white=None),
        after=PositionEval(cp_white=None, mate_white=-3),
    )
    assert walked_in.is_blunder is True
    assert walked_in.eval_mate == -3
    assert walked_in.under_time_pressure is False
    assert opponent.is_blunder is False


def test_ply_20_stays_an_opening_even_with_almost_no_pieces() -> None:
    endgame = "8/8/4k3/8/8/4K3/4P3/8 w - - 0 40"
    assert phase_for(endgame, 20) == "opening"
    assert phase_for(endgame, 21) == "endgame"


def test_phase_moves_from_opening_to_endgame() -> None:
    assert phase_for(START, 8) == "opening"
    middlegame = "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 6 8"
    assert phase_for(middlegame, 30) == "middlegame"
    endgame = "8/8/4k3/8/8/4K3/4P3/8 w - - 0 40"
    assert phase_for(endgame, 60) == "endgame"


SCHOLAR = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"
FOOL = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"


def test_delivering_checkmate_as_white_is_never_a_blunder() -> None:
    # Stockfish scores a mated position as "mate 0", which loses the sign:
    # python-chess reports mate() == 0 for both the winner and the loser.
    judgement = judge_move(
        fen_before=SCHOLAR,
        uci="h5f7",
        ply=7,
        clock_seconds=5,
        is_player_move=True,
        before=PositionEval(cp_white=None, mate_white=1),
        after=PositionEval(cp_white=None, mate_white=0),
    )
    assert judgement.is_blunder is False
    assert judgement.blunder_severity_cp == 0
    assert judgement.under_time_pressure is False


def test_delivering_checkmate_as_black_is_never_a_blunder() -> None:
    judgement = judge_move(
        fen_before=FOOL,
        uci="d8h4",
        ply=4,
        clock_seconds=None,
        is_player_move=True,
        before=PositionEval(cp_white=None, mate_white=-1),
        after=PositionEval(cp_white=None, mate_white=0),
    )
    assert judgement.is_blunder is False
    assert judgement.blunder_severity_cp == 0
