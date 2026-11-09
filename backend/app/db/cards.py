from dataclasses import dataclass
from functools import lru_cache

import chess


@dataclass(frozen=True)
class GameCard:
    id: str
    result: str
    player_color: str
    opponent: str
    time_class: str
    played_at: str | None
    final_fen: str
    analyzed: bool


@dataclass(frozen=True)
class BlunderNote:
    san: str
    ply: int
    phase: str
    severity_cp: int
    square: str
    under_time_pressure: bool
    fen: str
    played_uci: str
    best_uci: str
    best_san: str
    reply_uci: str
    reply_san: str


def make_blunder_note(
    *,
    san: str,
    ply: int,
    phase: str,
    severity_cp: int,
    square: str,
    under_time_pressure: bool,
    fen: str,
    played_uci: str,
    best_uci: str | None,
    reply_uci: str | None = None,
) -> BlunderNote:
    """reply_uci is the engine's best move for the opponent right after the blunder.

    It is the stored best move of the next ply, so it shows how the blunder is punished.
    """
    stored = best_uci or ""
    reply = reply_uci or ""
    best_san, reply_san = move_names(fen, played_uci, stored, reply)
    return BlunderNote(
        san=san,
        ply=ply,
        phase=phase,
        severity_cp=severity_cp,
        square=square,
        under_time_pressure=under_time_pressure,
        fen=fen,
        played_uci=played_uci,
        best_uci=stored,
        best_san=best_san,
        reply_uci=reply,
        reply_san=reply_san,
    )


@lru_cache(maxsize=16_384)
def move_names(fen: str, played_uci: str, best_uci: str, reply_uci: str) -> tuple[str, str]:
    """Readable names for the better move and for the reply after the played move.

    Reading a FEN is the slow part of a report, so the board is read once per blunder,
    and the result is kept: a stored blunder never changes, so the names never do.
    """
    try:
        board = chess.Board(fen)
    except ValueError:
        return "", ""
    best_san = _san(board, best_uci)
    try:
        board.push(chess.Move.from_uci(played_uci))
    except ValueError:  # python-chess move errors all subclass ValueError
        return best_san, ""
    return best_san, _san(board, reply_uci)


def _san(board: chess.Board, uci: str) -> str:
    if len(uci) < 4:
        return ""
    try:
        return board.san(chess.Move.from_uci(uci))
    except ValueError:  # python-chess move errors all subclass ValueError
        return ""


@dataclass(frozen=True)
class ReviewMove:
    """REV-01: one stored move for the game review. The eval is the position after the move, White's view."""

    ply: int
    san: str
    uci: str
    fen_before: str
    best_uci: str
    best_san: str
    eval_cp: int | None
    eval_mate: int | None
    clock_seconds: int | None
    is_player_move: bool
    is_blunder: bool


@dataclass(frozen=True)
class GameDetail:
    username: str
    card: GameCard
    blunders: tuple[BlunderNote, ...]
    moves: tuple[ReviewMove, ...] = ()


@dataclass(frozen=True)
class LibraryReport:
    games_total: int
    games_analyzed: int
    games_scored: int
    blunders: tuple[tuple[str, BlunderNote], ...]
