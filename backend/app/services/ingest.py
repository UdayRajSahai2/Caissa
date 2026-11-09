from dataclasses import dataclass

from app.adapters.chess.chesscom import ChessComClient
from app.db.memory import MemoryGameStore
from app.db.repository import SqlGameStore
from app.domain.normalize import recent_archive_urls, normalize_game, select_for_analysis
from app.domain.username import validate_username

GameStore = SqlGameStore | MemoryGameStore


@dataclass(frozen=True)
class IngestResult:
    username: str
    archive_count: int
    games_seen: int
    bullet_excluded: int
    selected: int
    already_stored: int
    pending_ids: list[str]


async def ingest_player(
    *,
    username: str,
    include_bullet: bool,
    source: ChessComClient,
    store: GameStore,
    needed: int | None = None,
    refresh_latest: bool = False,
) -> IngestResult:
    """Fetch archives, drop bullet games, and skip ids already stored.

    `needed` stops after that many games are stored, walking newest month
    first and skipping a month that was already saved. `refresh_latest`
    re-reads only the newest month and inserts every game that is not stored yet.
    Without either, the latest three months are read (the original batch).
    A game id already stored is not inserted again (ING-08).
    """
    validated = validate_username(username)
    archives = await source.list_archive_urls(validated)
    if refresh_latest:
        newest = archives[-1:]
        if not newest:
            return _store_raw(validated, [], include_bullet=include_bullet, store=store)
        month = await source.fetch_month_games(newest[0], validated)
        ordered = sorted(month, key=_end_time, reverse=True)
        return _store_raw(
            validated,
            ordered,
            include_bullet=include_bullet,
            store=store,
            archive_count=1,
            limit=max(len(ordered), 1),
        )
    if needed is None:
        return await _ingest_months(
            validated,
            recent_archive_urls(archives),
            include_bullet=include_bullet,
            source=source,
            store=store,
            remember=False,
        )

    newest_first = list(reversed(archives))
    seen = set(store.fetched_archives(validated))
    chosen: list[str] = []
    for url in newest_first:
        if store.game_count(validated) >= needed:
            break
        if url in seen:
            continue
        chosen.append(url)
        await _ingest_months(
            validated,
            [url],
            include_bullet=include_bullet,
            source=source,
            store=store,
            remember=True,
            needed=needed,
        )
        seen.add(url)
    return IngestResult(
        username=validated,
        archive_count=len(chosen),
        games_seen=store.game_count(validated),
        bullet_excluded=0,
        selected=store.game_count(validated),
        already_stored=0,
        pending_ids=[],
    )


async def _ingest_months(
    username: str,
    archives: list[str],
    *,
    include_bullet: bool,
    source: ChessComClient,
    store: GameStore,
    remember: bool,
    needed: int | None = None,
) -> IngestResult:
    raw_games: list[dict] = []
    for url in archives:
        month = await source.fetch_month_games(url, username)
        if needed is None:
            raw_games.extend(month)
            if remember:
                store.mark_archive_fetched(username, url)
            continue
        ordered = sorted(month, key=_end_time, reverse=True)
        filled = False
        for raw in ordered:
            if store.game_count(username) >= needed:
                filled = True
                break
            _store_raw(username, [raw], include_bullet=include_bullet, store=store, limit=1)
        if not filled:
            store.mark_archive_fetched(username, url)
    return _store_raw(username, raw_games, include_bullet=include_bullet, store=store, archive_count=len(archives))


def _store_raw(
    username: str,
    raw_games: list[dict],
    *,
    include_bullet: bool,
    store: GameStore,
    archive_count: int = 0,
    limit: int = 200,
) -> IngestResult:
    normalized = []
    for raw in raw_games:
        game = normalize_game(raw, username)
        if game is not None:
            normalized.append(game)
    selected, bullet_excluded = select_for_analysis(normalized, include_bullet=include_bullet, limit=limit)
    pending_ids = store.ensure_games(username, selected)
    return IngestResult(
        username=username,
        archive_count=archive_count,
        games_seen=len(raw_games),
        bullet_excluded=bullet_excluded,
        selected=len(selected),
        already_stored=len(selected) - len(pending_ids),
        pending_ids=pending_ids,
    )


def _end_time(raw: dict) -> int:
    value = raw.get("end_time")
    return value if isinstance(value, int) else 0
