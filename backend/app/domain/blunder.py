from dataclasses import dataclass

import chess

BLUNDER_LOSS_CP = 150
WINNING_CP = 150
TIME_PRESSURE_SECONDS = 30
_MATE_EQUIVALENT_CP = 100_000


@dataclass(frozen=True)
class PositionEval:
    """White's point of view. Exactly one of cp_white or mate_white is set.

    best_uci is the engine's first choice from this position, when the search returned one.
    """

    cp_white: int | None
    mate_white: int | None
    best_uci: str | None = None


@dataclass(frozen=True)
class MoveJudgement:
    eval_cp: int | None
    eval_mate: int | None
    is_blunder: bool
    blunder_severity_cp: int
    phase: str
    board_region: str
    under_time_pressure: bool


def judge_move(
    *,
    fen_before: str,
    uci: str,
    ply: int,
    clock_seconds: int | None,
    is_player_move: bool,
    before: PositionEval,
    after: PositionEval,
) -> MoveJudgement:
    """ANA-03 to ANA-05. Only the requested player's moves can be blunders."""
    mover_is_white = _mover_is_white(fen_before)
    before_pov = _pov_cp(before, mover_is_white)
    after_pov = (
        _MATE_EQUIVALENT_CP if _delivers_mate(fen_before, uci) else _pov_cp(after, mover_is_white)
    )
    loss = before_pov - after_pov
    swung = before_pov >= WINNING_CP and after_pov <= -WINNING_CP
    blunder = is_player_move and (loss >= BLUNDER_LOSS_CP or swung)
    return MoveJudgement(
        eval_cp=after.cp_white,
        eval_mate=after.mate_white,
        is_blunder=blunder,
        blunder_severity_cp=max(loss, 0) if blunder else 0,
        phase=phase_for(fen_before, ply),
        board_region=_destination(uci),
        under_time_pressure=bool(
            blunder and clock_seconds is not None and clock_seconds < TIME_PRESSURE_SECONDS
        ),
    )


def phase_for(fen: str, ply: int) -> str:
    """Opening through ply 20. Endgame when the queens are gone or few pieces remain."""
    if ply <= 20:
        return "opening"
    board = chess.Board(fen)
    queens = len(board.pieces(chess.QUEEN, chess.WHITE)) + len(board.pieces(chess.QUEEN, chess.BLACK))
    non_kings = chess.popcount(board.occupied) - 2
    if queens == 0 or non_kings <= 10:
        return "endgame"
    return "middlegame"


def _pov_cp(evaluation: PositionEval, mover_is_white: bool) -> int:
    if evaluation.mate_white is not None:
        white_cp = _MATE_EQUIVALENT_CP if evaluation.mate_white > 0 else -_MATE_EQUIVALENT_CP
    else:
        white_cp = evaluation.cp_white or 0
    return white_cp if mover_is_white else -white_cp


def _delivers_mate(fen: str, uci: str) -> bool:
    """A move that checkmates is never a blunder.

    The engine scores a mated position as "mate 0", and python-chess reports mate() == 0
    for the winner and the loser alike, so the sign cannot be read from the score.
    """
    board = chess.Board(fen)
    try:
        board.push_uci(uci)
    except ValueError:
        return False
    return board.is_checkmate()


def _mover_is_white(fen: str) -> bool:
    return chess.Board(fen).turn == chess.WHITE


def _destination(uci: str) -> str:
    if len(uci) >= 4:
        return uci[2:4]
    return ""
