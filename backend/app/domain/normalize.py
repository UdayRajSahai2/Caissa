import io
import re
from dataclasses import dataclass
from datetime import datetime, timezone

import chess
import chess.pgn

from app.domain.username import validate_username

RECENT_ARCHIVE_MONTHS = 3
GAME_CAP = 200
DRAW_RESULTS = frozenset(
    {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}
)
_CLOCK = re.compile(r"\[%clk\s+(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\]")


@dataclass(frozen=True)
class NormalizedMove:
    ply: int
    san: str
    uci: str
    fen_before: str
    clock_seconds: int | None
    is_player_move: bool


@dataclass(frozen=True)
class NormalizedGame:
    chesscom_game_id: str
    pgn: str
    time_control: str
    time_class: str
    result: str
    played_at: datetime | None
    player_color: str
    moves: tuple[NormalizedMove, ...]
    metadata: dict


def recent_archive_urls(urls: list[str], months: int = RECENT_ARCHIVE_MONTHS) -> list[str]:
    """Chess.com lists archives oldest-first. ING-07 keeps the latest months only."""
    if months < 1:
        return []
    return urls[-months:]


def normalize_game(raw: dict, username: str) -> NormalizedGame | None:
    """Turn one Chess.com game object into moves, clocks, and the player's result.

    Returns None when the game has no stable id or the PGN cannot be read.
    The original PGN is kept for the engine; it is not logged.
    """
    player = validate_username(username).casefold()
    game_id = _game_id(raw)
    pgn = raw.get("pgn")
    if game_id is None or not isinstance(pgn, str) or not pgn.strip():
        return None

    parsed = chess.pgn.read_game(io.StringIO(pgn))
    if parsed is None:
        return None

    white = _side_name(raw.get("white"))
    black = _side_name(raw.get("black"))
    if player == white.casefold():
        color = "white"
    elif player == black.casefold():
        color = "black"
    else:
        return None

    board = parsed.board()
    moves: list[NormalizedMove] = []
    ply = 0
    for node in parsed.mainline():
        if node.move is None:
            continue
        ply += 1
        mover_is_white = board.turn == chess.WHITE
        moves.append(
            NormalizedMove(
                ply=ply,
                san=board.san(node.move),
                uci=node.move.uci(),
                fen_before=board.fen(),
                clock_seconds=_clock_seconds(node.comment),
                is_player_move=mover_is_white if color == "white" else not mover_is_white,
            )
        )
        board.push(node.move)

    return NormalizedGame(
        chesscom_game_id=game_id,
        pgn=pgn,
        time_control=_text(raw.get("time_control")),
        time_class=_text(raw.get("time_class")).casefold(),
        result=_player_result(raw.get(color)),
        played_at=_played_at(raw.get("end_time")),
        player_color=color,
        moves=tuple(moves),
        metadata=_metadata(raw),
    )


def select_for_analysis(
    games: list[NormalizedGame],
    *,
    include_bullet: bool,
    limit: int = GAME_CAP,
) -> tuple[list[NormalizedGame], int]:
    """ING-09. Bullet games are left out unless the caller opts in. Then cap at 200."""
    kept: list[NormalizedGame] = []
    excluded = 0
    seen: set[str] = set()
    ordered = sorted(games, key=lambda game: game.played_at or _EPOCH, reverse=True)
    for game in ordered:
        if game.chesscom_game_id in seen:
            continue
        seen.add(game.chesscom_game_id)
        if not include_bullet and game.time_class == "bullet":
            excluded += 1
            continue
        kept.append(game)
        if len(kept) >= limit:
            break
    return kept, excluded


def _game_id(raw: dict) -> str | None:
    uuid = raw.get("uuid")
    if isinstance(uuid, str) and uuid.strip():
        return uuid.strip()
    url = raw.get("url")
    if isinstance(url, str) and url.strip("/"):
        tail = url.rstrip("/").split("/")[-1].strip()
        if tail:
            return tail
    return None


def _side_name(side: object) -> str:
    if isinstance(side, dict):
        username = side.get("username")
        if isinstance(username, str):
            return username
    return ""


def _player_result(side: object) -> str:
    if not isinstance(side, dict):
        return "unknown"
    token = _text(side.get("result")).casefold()
    if token == "win":
        return "win"
    if token in DRAW_RESULTS:
        return "draw"
    if token:
        return "loss"
    return "unknown"


def _played_at(value: object) -> datetime | None:
    if isinstance(value, int):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    return None


def _clock_seconds(comment: str) -> int | None:
    match = _CLOCK.search(comment or "")
    if match is None:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2))
    seconds = int(float(match.group(3)))
    return hours * 3600 + minutes * 60 + seconds


def _metadata(raw: dict) -> dict:
    """Keep identifiers and the result fields. The PGN stays in its own column."""
    kept = {}
    for key in ("url", "uuid", "time_class", "time_control", "end_time", "white", "black", "rules"):
        if key in raw:
            kept[key] = raw[key]
    return kept


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


_EPOCH = datetime.min.replace(tzinfo=timezone.utc)
