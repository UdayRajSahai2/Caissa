import io
from dataclasses import dataclass

import chess
import chess.engine
import chess.pgn

from app.domain.blunder import MoveJudgement, PositionEval, judge_move


class EngineUnavailable(RuntimeError):
    """Stockfish is not configured, or the binary could not be started."""


class Engine:
    """Structural stand-in so tests can supply scores without a binary."""

    def evaluate(self, board: chess.Board) -> PositionEval:
        raise NotImplementedError

    def close(self) -> None:
        return None


class StockfishEngine(Engine):
    """ANA-02. One UCI process, fixed depth, closed by the caller."""

    def __init__(self, path: str, depth: int = 14) -> None:
        if not path:
            raise EngineUnavailable("Stockfish is not configured on this machine.")
        try:
            self._engine = chess.engine.SimpleEngine.popen_uci(path)
        except (OSError, chess.engine.EngineError) as exc:
            raise EngineUnavailable("Stockfish is not configured on this machine.") from exc
        self._depth = depth

    def evaluate(self, board: chess.Board) -> PositionEval:
        info = self._engine.analyse(board, chess.engine.Limit(depth=self._depth))
        white = info["score"].white()
        best = _best_uci(info)
        if white.is_mate():
            return PositionEval(cp_white=None, mate_white=white.mate(), best_uci=best)
        return PositionEval(cp_white=white.score(), mate_white=None, best_uci=best)

    def close(self) -> None:
        self._engine.quit()


@dataclass(frozen=True)
class AnalyzedMove:
    ply: int
    san: str
    uci: str
    fen_before: str
    clock_seconds: int | None
    is_player_move: bool
    judgement: MoveJudgement
    best_uci: str | None = None


def evaluate_game(
    pgn: str,
    player_color: str,
    engine: Engine,
    clocks: dict[int, int | None] | None = None,
) -> list[AnalyzedMove]:
    """Score every position once, then judge the move that joined each pair. ANA-07."""
    parsed = chess.pgn.read_game(io.StringIO(pgn))
    if parsed is None:
        raise ValueError("pgn could not be read")
    board = parsed.board()
    before = engine.evaluate(board)
    analyzed: list[AnalyzedMove] = []
    ply = 0
    for node in parsed.mainline():
        if node.move is None:
            continue
        ply += 1
        mover_is_white = board.turn == chess.WHITE
        fen_before = board.fen()
        san = board.san(node.move)
        uci = node.move.uci()
        board.push(node.move)
        after = engine.evaluate(board)
        clock = None if clocks is None else clocks.get(ply)
        is_player = mover_is_white if player_color == "white" else not mover_is_white
        analyzed.append(
            AnalyzedMove(
                ply=ply,
                san=san,
                uci=uci,
                fen_before=fen_before,
                clock_seconds=clock,
                is_player_move=is_player,
                best_uci=before.best_uci or "",
                judgement=judge_move(
                    fen_before=fen_before,
                    uci=uci,
                    ply=ply,
                    clock_seconds=clock,
                    is_player_move=is_player,
                    before=before,
                    after=after,
                ),
            )
        )
        before = after
    return analyzed


def _best_uci(info: chess.engine.InfoDict) -> str | None:
    pv = info.get("pv")
    if not pv:
        return None
    move = pv[0]
    if isinstance(move, chess.Move):
        return move.uci()
    return None
