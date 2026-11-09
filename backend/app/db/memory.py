from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.db.cards import BlunderNote, GameCard, GameDetail, LibraryReport, ReviewMove, make_blunder_note, move_names
from app.db.repository import StoredGame
from app.domain.normalize import NormalizedGame
from app.domain.position import final_fen, opponent_name
from app.engine.stockfish import AnalyzedMove


@dataclass
class MemoryRecord:
    internal_id: str
    game: NormalizedGame
    username: str = ""
    analyzed: list[AnalyzedMove] | None = None


@dataclass
class MemoryGameStore:
    """In-memory stand-in for tests. Same rules as the SQL store."""

    records: dict[tuple[str, str], MemoryRecord] = field(default_factory=dict)
    archives: dict[str, list[str]] = field(default_factory=dict)
    synced_at: dict[str, datetime] = field(default_factory=dict)
    _seq: int = 0

    def ensure_games(self, username: str, games: list[NormalizedGame]) -> list[str]:
        pending: list[str] = []
        owner = username.casefold()
        for game in games:
            key = (owner, game.chesscom_game_id)
            existing = self.records.get(key)
            if existing is None:
                self._seq += 1
                internal = str(self._seq)
                self.records[key] = MemoryRecord(internal, game, owner)
                pending.append(internal)
            elif existing.analyzed is None:
                pending.append(existing.internal_id)
        self.synced_at[username.casefold()] = datetime.now(timezone.utc)
        return pending

    def last_synced_at(self, username: str) -> datetime | None:
        return self.synced_at.get(username.casefold())

    def game_count(self, username: str) -> int:
        return sum(1 for record in self.records.values() if record.username == username.casefold())

    def fetched_archives(self, username: str) -> list[str]:
        return list(self.archives.get(username.casefold(), []))

    def mark_archive_fetched(self, username: str, url: str) -> None:
        stored = self.archives.setdefault(username.casefold(), [])
        if url not in stored:
            stored.append(url)

    def list_games(self, username: str, page: int, page_size: int) -> tuple[int, list[GameCard]]:
        owned = self._owned(username)
        start = (page - 1) * page_size
        return len(owned), [_memory_card(record) for record in owned[start : start + page_size]]

    def game_detail(self, internal_id: str) -> GameDetail | None:
        record = self._by_internal(internal_id)
        if record is None:
            return None
        notes = []
        for item in record.analyzed or []:
            if not item.judgement.is_blunder:
                continue
            notes.append(
                make_blunder_note(
                    san=item.san,
                    ply=item.ply,
                    phase=item.judgement.phase,
                    severity_cp=item.judgement.blunder_severity_cp,
                    square=item.judgement.board_region,
                    under_time_pressure=item.judgement.under_time_pressure,
                    fen=item.fen_before,
                    played_uci=item.uci,
                    best_uci=item.best_uci,
                    reply_uci=_reply(record.analyzed or [], item.ply),
                )
            )
        moves = tuple(
            ReviewMove(
                ply=item.ply,
                san=item.san,
                uci=item.uci,
                fen_before=item.fen_before,
                best_uci=item.best_uci or "",
                best_san=move_names(item.fen_before, item.uci, item.best_uci or "", "")[0],
                eval_cp=item.judgement.eval_cp,
                eval_mate=item.judgement.eval_mate,
                clock_seconds=item.clock_seconds,
                is_player_move=item.is_player_move,
                is_blunder=item.judgement.is_blunder,
            )
            for item in record.analyzed or []
        )
        return GameDetail(
            username=record.username, card=_memory_card(record), blunders=tuple(notes), moves=moves
        )

    def library_counts(self, username: str) -> tuple[int, int, int]:
        owned = self._owned(username)
        analyzed = sum(1 for record in owned if record.analyzed is not None)
        return len(owned), analyzed, sum(1 for record in owned if _memory_ready(record))

    def library_report(self, username: str) -> LibraryReport:
        owned = self._owned(username)
        notes: list[tuple[str, BlunderNote]] = []
        analyzed = 0
        scored = 0
        for record in owned:
            if record.analyzed is not None:
                analyzed += 1
            if _memory_ready(record):
                scored += 1
            for item in record.analyzed or []:
                if not item.judgement.is_blunder:
                    continue
                notes.append(
                    (
                        record.internal_id,
                        make_blunder_note(
                            san=item.san,
                            ply=item.ply,
                            phase=item.judgement.phase,
                            severity_cp=item.judgement.blunder_severity_cp,
                            square=item.judgement.board_region,
                            under_time_pressure=item.judgement.under_time_pressure,
                            fen=item.fen_before,
                            played_uci=item.uci,
                            best_uci=item.best_uci,
                            reply_uci=_reply(record.analyzed or [], item.ply),
                        ),
                    )
                )
        return LibraryReport(len(owned), analyzed, scored, tuple(notes))

    def unscored_ids(self, username: str, limit: int) -> list[str]:
        if limit < 1:
            return []
        waiting = [record.internal_id for record in self._owned(username) if not _memory_ready(record)]
        return waiting[:limit]

    def _owned(self, username: str) -> list[MemoryRecord]:
        owned = [record for record in self.records.values() if record.username == username.casefold()]
        owned.sort(key=lambda record: record.game.played_at or _EPOCH, reverse=True)
        return owned

    def load_game(self, internal_id: str) -> StoredGame | None:
        record = self._by_internal(internal_id)
        if record is None:
            return None
        return StoredGame(
            internal_id=record.internal_id,
            pgn=record.game.pgn,
            player_color=record.game.player_color,
            clocks={move.ply: move.clock_seconds for move in record.game.moves},
        )

    def analysis_exists(self, internal_id: str) -> bool:
        record = self._by_internal(internal_id)
        return record is not None and record.analyzed is not None

    def suggestions_ready(self, internal_id: str) -> bool:
        record = self._by_internal(internal_id)
        if record is None or record.analyzed is None:
            return False
        return all(item.best_uci is not None for item in record.analyzed if item.judgement.is_blunder)

    def save_analysis(self, internal_id: str, analyzed: list[AnalyzedMove]) -> int:
        record = self._by_internal(internal_id)
        if record is None:
            raise KeyError(internal_id)
        record.analyzed = analyzed
        return sum(1 for move in analyzed if move.judgement.is_blunder)

    def _by_internal(self, internal_id: str) -> MemoryRecord | None:
        for record in self.records.values():
            if record.internal_id == internal_id:
                return record
        return None


def _memory_ready(record: MemoryRecord) -> bool:
    if record.analyzed is None:
        return False
    return all(item.best_uci is not None for item in record.analyzed if item.judgement.is_blunder)


def _memory_card(record: MemoryRecord) -> GameCard:
    game = record.game
    played = None if game.played_at is None else game.played_at.isoformat()
    return GameCard(
        id=record.internal_id,
        result=game.result,
        player_color=game.player_color,
        opponent=opponent_name(game.metadata, game.player_color),
        time_class=game.time_class,
        played_at=played,
        final_fen=final_fen([(move.ply, move.fen_before, move.uci) for move in game.moves]),
        analyzed=record.analyzed is not None,
    )


_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _reply(analyzed: list[AnalyzedMove], ply: int) -> str | None:
    return next((item.best_uci for item in analyzed if item.ply == ply + 1), None)
