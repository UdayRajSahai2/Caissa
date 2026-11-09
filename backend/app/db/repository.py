from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import Select, and_, delete, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased, selectinload

from app.db.cards import GameCard, GameDetail, LibraryReport, ReviewMove, make_blunder_note, move_names
from app.db.models import Blunder, Game, Move, Player
from app.domain.normalize import NormalizedGame
from app.domain.position import final_fen, opponent_name
from app.engine.stockfish import AnalyzedMove

# The opponent's move right after a blunder. Its stored best move is how the blunder is punished.
_Reply = aliased(Move)
_REPLY_JOIN = and_(_Reply.game_id == Move.game_id, _Reply.ply_number == Move.ply_number + 1)


@dataclass(frozen=True)
class StoredGame:
    internal_id: str
    pgn: str
    player_color: str
    clocks: dict[int, int | None]


class SqlGameStore:
    """Postgres (or SQLite in tests) for games, moves, and blunders."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def ensure_games(self, username: str, games: list[NormalizedGame]) -> list[str]:
        """Insert games that are new for this player. Return ids that still need analysis.

        A Chess.com game has one id and two players. The unique key is the
        player plus that id, so the opponent can store the same game.
        A stored game that never finished analysis is returned so it can be retried.
        """
        player = self._player(username)
        pending: list[str] = []
        for game in games:
            existing = self._session.scalar(
                select(Game).where(
                    Game.player_id == player.id,
                    Game.chesscom_game_id == game.chesscom_game_id,
                )
            )
            if existing is None:
                inserted = self._insert_game(player.id, game)
                if inserted is not None:
                    pending.append(inserted)
                    continue
                existing = self._session.scalar(
                    select(Game).where(
                        Game.player_id == player.id,
                        Game.chesscom_game_id == game.chesscom_game_id,
                    )
                )
            if existing is not None and existing.analyzed_at is None:
                pending.append(str(existing.id))
        player.last_synced_at = datetime.now(timezone.utc)
        self._session.commit()
        return pending

    def last_synced_at(self, username: str) -> datetime | None:
        player = self._session.scalar(
            select(Player).where(Player.chesscom_username == username.casefold())
        )
        if player is None:
            return None
        return player.last_synced_at

    def game_count(self, username: str) -> int:
        player = self._session.scalar(
            select(Player).where(Player.chesscom_username == username.casefold())
        )
        if player is None:
            return 0
        total = self._session.scalar(
            select(func.count()).select_from(Game).where(Game.player_id == player.id)
        )
        return int(total or 0)

    def fetched_archives(self, username: str) -> list[str]:
        player = self._session.scalar(
            select(Player).where(Player.chesscom_username == username.casefold())
        )
        if player is None or not player.fetched_archives:
            return []
        return [url for url in player.fetched_archives if isinstance(url, str)]

    def mark_archive_fetched(self, username: str, url: str) -> None:
        player = self._player(username)
        current = [item for item in (player.fetched_archives or []) if isinstance(item, str)]
        if url not in current:
            player.fetched_archives = [*current, url]
            self._session.commit()

    def list_games(self, username: str, page: int, page_size: int) -> tuple[int, list[GameCard]]:
        player = self._session.scalar(
            select(Player).where(Player.chesscom_username == username.casefold())
        )
        if player is None:
            return 0, []
        total = self._session.scalar(
            select(func.count()).select_from(Game).where(Game.player_id == player.id)
        )
        rows = self._session.scalars(
            select(Game)
            .options(selectinload(Game.moves))
            .where(Game.player_id == player.id)
            .order_by(Game.played_at.desc().nulls_last(), Game.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return int(total or 0), [_card(row) for row in rows]

    def game_detail(self, internal_id: str) -> GameDetail | None:
        game = self._session.scalar(
            select(Game)
            .options(selectinload(Game.moves), selectinload(Game.player))
            .where(Game.id == int(internal_id))
        )
        if game is None:
            return None
        notes = self._session.execute(
            select(Move, Blunder, _Reply.best_uci)
            .join(Blunder, Blunder.move_id == Move.id)
            .outerjoin(_Reply, _REPLY_JOIN)
            .where(Blunder.game_id == game.id)
            .order_by(Move.ply_number)
        ).all()
        blunders = tuple(
            make_blunder_note(
                san=move.move_san,
                ply=move.ply_number,
                phase=blunder.phase,
                severity_cp=move.blunder_severity_cp,
                square=move.board_region,
                under_time_pressure=blunder.under_time_pressure,
                fen=move.fen_before,
                played_uci=move.uci,
                best_uci=move.best_uci,
                reply_uci=reply_uci,
            )
            for move, blunder, reply_uci in notes
        )
        moves = tuple(
            ReviewMove(
                ply=move.ply_number,
                san=move.move_san,
                uci=move.uci,
                fen_before=move.fen_before,
                best_uci=move.best_uci or "",
                best_san=move_names(move.fen_before, move.uci, move.best_uci or "", "")[0],
                eval_cp=move.eval_cp,
                eval_mate=move.eval_mate,
                clock_seconds=move.clock_remaining_seconds,
                is_player_move=move.is_player_move,
                is_blunder=move.is_blunder,
            )
            for move in sorted(game.moves, key=lambda item: item.ply_number)
        )
        return GameDetail(
            username=game.player.chesscom_username, card=_card(game), blunders=blunders, moves=moves
        )

    def library_counts(self, username: str) -> tuple[int, int, int]:
        """Games stored, analyzed, and fully scored for this player, without reading any blunder."""
        player = self._session.scalar(
            select(Player).where(Player.chesscom_username == username.casefold())
        )
        if player is None:
            return 0, 0, 0
        return self._counts(player.id)

    def _counts(self, player_id: int) -> tuple[int, int, int]:
        total = int(
            self._session.scalar(select(func.count()).select_from(Game).where(Game.player_id == player_id))
            or 0
        )
        analyzed = int(
            self._session.scalar(
                select(func.count())
                .select_from(Game)
                .where(Game.player_id == player_id, Game.analyzed_at.is_not(None))
            )
            or 0
        )
        waiting = int(
            self._session.scalar(select(func.count()).select_from(self._waiting_games(player_id).subquery()))
            or 0
        )
        return total, analyzed, total - waiting

    def library_report(self, username: str) -> LibraryReport:
        player = self._session.scalar(
            select(Player).where(Player.chesscom_username == username.casefold())
        )
        if player is None:
            return LibraryReport(0, 0, 0, ())
        total, analyzed, scored = self._counts(player.id)
        # Only the columns a note needs: loading whole rows (with FEN history and raw JSON
        # on the joined tables) cost more than the query itself.
        rows = self._session.execute(
            select(
                Blunder.game_id,
                Move.move_san,
                Move.ply_number,
                Blunder.phase,
                Move.blunder_severity_cp,
                Move.board_region,
                Blunder.under_time_pressure,
                Move.fen_before,
                Move.uci,
                Move.best_uci,
                _Reply.best_uci,
            )
            .join(Blunder, Blunder.move_id == Move.id)
            .outerjoin(_Reply, _REPLY_JOIN)
            .join(Game, Game.id == Blunder.game_id)
            .where(Game.player_id == player.id, Move.is_blunder.is_(True))
            .order_by(Move.blunder_severity_cp.desc(), Game.id, Move.ply_number)
        ).all()
        notes = tuple(
            (
                str(game_id),
                make_blunder_note(
                    san=san,
                    ply=ply,
                    phase=phase,
                    severity_cp=severity,
                    square=square,
                    under_time_pressure=pressure,
                    fen=fen,
                    played_uci=played,
                    best_uci=best,
                    reply_uci=reply,
                ),
            )
            for game_id, san, ply, phase, severity, square, pressure, fen, played, best, reply in rows
        )
        return LibraryReport(total, analyzed, scored, notes)

    def unscored_ids(self, username: str, limit: int) -> list[str]:
        player = self._session.scalar(
            select(Player).where(Player.chesscom_username == username.casefold())
        )
        if player is None or limit < 1:
            return []
        rows = self._session.scalars(
            self._waiting_games(player.id)
            .order_by(Game.played_at.desc().nulls_last(), Game.id.desc())
            .limit(limit)
        ).all()
        return [str(game_id) for game_id in rows]

    def _waiting_games(self, player_id: int) -> Select[tuple[int]]:
        missing_suggestion = exists(
            select(Move.id).where(
                Move.game_id == Game.id,
                Move.is_blunder.is_(True),
                Move.best_uci.is_(None),
            )
        )
        return select(Game.id).where(
            Game.player_id == player_id,
            or_(Game.analyzed_at.is_(None), missing_suggestion),
        )

    def load_game(self, internal_id: str) -> StoredGame | None:
        game = self._session.scalar(
            select(Game).options(selectinload(Game.moves)).where(Game.id == int(internal_id))
        )
        if game is None:
            return None
        clocks = {move.ply_number: move.clock_remaining_seconds for move in game.moves}
        return StoredGame(
            internal_id=str(game.id),
            pgn=game.pgn,
            player_color=game.player_color,
            clocks=clocks,
        )

    def analysis_exists(self, internal_id: str) -> bool:
        game = self._session.get(Game, int(internal_id))
        return game is not None and game.analyzed_at is not None

    def suggestions_ready(self, internal_id: str) -> bool:
        """True when every stored blunder has been checked for a better move.

        A blank string means the engine had no suggestion. NULL means the game
        was scored before that suggestion was stored, so it can be scored once more.
        """
        game = self._session.scalar(
            select(Game).options(selectinload(Game.moves)).where(Game.id == int(internal_id))
        )
        if game is None or game.analyzed_at is None:
            return False
        return all(move.best_uci is not None for move in game.moves if move.is_blunder)

    def save_analysis(self, internal_id: str, analyzed: list[AnalyzedMove]) -> int:
        """Write evals onto the stored moves and add one blunder row per player blunder."""
        game = self._session.scalar(
            select(Game).options(selectinload(Game.moves)).where(Game.id == int(internal_id))
        )
        if game is None:
            raise KeyError(internal_id)
        self._session.execute(delete(Blunder).where(Blunder.game_id == game.id))
        self._session.flush()
        by_ply = {move.ply_number: move for move in game.moves}
        blunders = 0
        for item in analyzed:
            row = by_ply.get(item.ply)
            if row is None:
                continue
            row.eval_cp = item.judgement.eval_cp
            row.eval_mate = item.judgement.eval_mate
            row.is_blunder = item.judgement.is_blunder
            row.blunder_severity_cp = item.judgement.blunder_severity_cp
            row.board_region = item.judgement.board_region
            row.best_uci = item.best_uci or ""
            if item.judgement.is_blunder:
                self._session.add(
                    Blunder(
                        move_id=row.id,
                        game_id=game.id,
                        player_id=game.player_id,
                        phase=item.judgement.phase,
                        under_time_pressure=item.judgement.under_time_pressure,
                    )
                )
                blunders += 1
        game.analyzed_at = datetime.now(timezone.utc)
        self._session.commit()
        return blunders

    def _insert_game(self, player_id: int, game: NormalizedGame) -> str | None:
        """Insert one game. Return its id, or None when a concurrent ingest already stored it."""
        try:
            with self._session.begin_nested():
                row = Game(
                    player_id=player_id,
                    chesscom_game_id=game.chesscom_game_id,
                    pgn=game.pgn,
                    time_control=game.time_control,
                    time_class=game.time_class,
                    result=game.result,
                    played_at=game.played_at,
                    raw_json=game.metadata,
                    player_color=game.player_color,
                )
                self._session.add(row)
                self._session.flush()
                for move in game.moves:
                    self._session.add(
                        Move(
                            game_id=row.id,
                            ply_number=move.ply,
                            move_san=move.san,
                            uci=move.uci,
                            fen_before=move.fen_before,
                            clock_remaining_seconds=move.clock_seconds,
                            is_player_move=move.is_player_move,
                            is_blunder=False,
                            blunder_severity_cp=0,
                            board_region="",
                        )
                    )
                return str(row.id)
        except IntegrityError:
            return None

    def _player(self, username: str) -> Player:
        stored = username.casefold()
        player = self._session.scalar(select(Player).where(Player.chesscom_username == stored))
        if player is not None:
            return player
        try:
            with self._session.begin_nested():
                player = Player(chesscom_username=stored)
                self._session.add(player)
                self._session.flush()
                return player
        except IntegrityError:
            found = self._session.scalar(select(Player).where(Player.chesscom_username == stored))
            if found is None:
                raise
            return found


def _card(game: Game) -> GameCard:
    played = None if game.played_at is None else game.played_at.isoformat()
    moves = [(move.ply_number, move.fen_before, move.uci) for move in game.moves]
    return GameCard(
        id=str(game.id),
        result=game.result,
        player_color=game.player_color,
        opponent=opponent_name(game.raw_json or {}, game.player_color),
        time_class=game.time_class,
        played_at=played,
        final_fen=final_fen(moves),
        analyzed=game.analyzed_at is not None,
    )
