import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.api.deps import (
    enforce_rate_limit,
    get_analysis_queue,
    get_ingest_queue,
    get_job_book,
    get_report_cache,
    get_store,
    require_app_origin,
)
from app.api.schemas import (
    AnalyzeAccepted,
    BlunderResponse,
    GameCardResponse,
    GameDetailResponse,
    GamePage,
    LibraryBlunderResponse,
    LibraryReportResponse,
    LibraryScoreAccepted,
    ReviewMoveResponse,
    ScoreAccepted,
)
from app.cache.reports import ReportCache
from app.db.cards import BlunderNote, GameCard, GameDetail
from app.db.memory import MemoryGameStore
from app.db.repository import SqlGameStore
from app.domain.username import UsernameError, validate_username
from app.jobs.active import reusable_ingest_job
from app.jobs.status import JobBook
from app.services.queue import AnalysisQueue, IngestQueue

logger = logging.getLogger(__name__)

router = APIRouter()

_MISSING_GAME = "That game was not found."
_OPEN = frozenset({"queued", "running"})
PAGE_SIZE = 10
_SCORE_BATCH = 8
_FRESH_FOR = timedelta(minutes=1)


@router.get("/library/{username}", response_model=AnalyzeAccepted)
async def sync_library(
    username: str,
    request: Request,
    include_bullet: bool = False,
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=PAGE_SIZE, ge=1, le=20),
    jobs: JobBook = Depends(get_job_book),
    queue: IngestQueue = Depends(get_ingest_queue),
    cache: ReportCache = Depends(get_report_cache),
    store: SqlGameStore | MemoryGameStore = Depends(get_store),
) -> AnalyzeAccepted:
    """Store enough games for this page. A full page already saved is returned at once.

    When the page is saved but the newest month is due a check, the answer is "refreshing":
    the saved games can be shown now while the check runs, instead of waiting on Chess.com.
    """
    try:
        validated = validate_username(username)
    except UsernameError:
        raise HTTPException(status_code=422, detail="Chess.com username is not valid.") from None

    require_app_origin(request)
    needed = page * page_size
    stored = store.game_count(validated)
    refresh_latest = stored >= needed and page == 1 and not _synced_recently(store, validated)
    if stored >= needed and not refresh_latest:
        return AnalyzeAccepted(username=validated, job_id=None, status="ready")

    waiting_status = "refreshing" if stored >= needed else "queued"
    active = reusable_ingest_job(jobs, cache, validated)
    if active is not None:
        return AnalyzeAccepted(username=validated, job_id=active, status=waiting_status)

    enforce_rate_limit(request)
    job_id = str(uuid4())
    jobs.create(job_id, validated)
    cache.remember_job(validated, job_id)
    queue.enqueue(validated, include_bullet, job_id, needed, refresh_latest)
    logger.info("enqueued library username=%s needed=%s refresh=%s", validated, needed, refresh_latest)
    return AnalyzeAccepted(username=validated, job_id=job_id, status=waiting_status)


@router.get("/library/{username}/games", response_model=GamePage)
def list_games(
    username: str,
    page: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=PAGE_SIZE, ge=1, le=20),
    store: SqlGameStore | MemoryGameStore = Depends(get_store),
) -> GamePage:
    try:
        validated = validate_username(username)
    except UsernameError:
        raise HTTPException(status_code=422, detail="Chess.com username is not valid.") from None
    total, cards = store.list_games(validated, page, page_size)
    return GamePage(
        username=validated,
        page=page,
        page_size=page_size,
        total=total,
        games=[_card_response(card) for card in cards],
    )


@router.get("/library/{username}/report", response_model=LibraryReportResponse)
def read_library_report(
    username: str,
    store: SqlGameStore | MemoryGameStore = Depends(get_store),
) -> LibraryReportResponse:
    """Blunders already stored for this player. Games that are not scored yet are counted, not invented."""
    try:
        validated = validate_username(username)
    except UsernameError:
        raise HTTPException(status_code=422, detail="Chess.com username is not valid.") from None
    report = store.library_report(validated)
    return LibraryReportResponse(
        username=validated,
        games_total=report.games_total,
        games_analyzed=report.games_analyzed,
        games_scored=report.games_scored,
        blunders=[_library_blunder(game_id, note) for game_id, note in report.blunders],
    )


@router.post("/library/{username}/analyze", response_model=LibraryScoreAccepted)
def score_library(
    username: str,
    request: Request,
    jobs: JobBook = Depends(get_job_book),
    queue: AnalysisQueue = Depends(get_analysis_queue),
    store: SqlGameStore | MemoryGameStore = Depends(get_store),
) -> LibraryScoreAccepted:
    """Queue a small batch of this player's unscored games. Already running games are left alone."""
    try:
        validated = validate_username(username)
    except UsernameError:
        raise HTTPException(status_code=422, detail="Chess.com username is not valid.") from None
    require_app_origin(request)
    games_total, _analyzed, games_scored = store.library_counts(validated)
    if games_scored >= games_total:
        return LibraryScoreAccepted(
            username=validated,
            status="ready",
            job_id=None,
            queued=0,
            games_total=games_total,
            games_scored=games_scored,
        )
    claimed: list[str] = []
    job_id: str | None = None
    for game_id in store.unscored_ids(validated, limit=40):
        if jobs.active_game(game_id) is not None:
            continue
        if job_id is None:
            enforce_rate_limit(request)
            job_id = str(uuid4())
            jobs.create(job_id, validated)
        held = jobs.claim_game(game_id, job_id)
        if held is not None:
            continue
        claimed.append(game_id)
        if len(claimed) >= _SCORE_BATCH:
            break
    # games_total must be set before enqueue so early finishers can reach succeeded.
    if job_id is not None and claimed:
        jobs.update(job_id, status="queued", games_total=len(claimed), games_done=0)
        for game_id in claimed:
            queue.enqueue_game(game_id, job_id)
    return LibraryScoreAccepted(
        username=validated,
        status="queued" if games_scored < games_total else "ready",
        job_id=job_id if claimed else None,
        queued=len(claimed),
        games_total=games_total,
        games_scored=games_scored,
    )


@router.get("/games/{game_id}", response_model=GameDetailResponse)
def read_game(
    game_id: str,
    store: SqlGameStore | MemoryGameStore = Depends(get_store),
) -> GameDetailResponse:
    detail = store.game_detail(_key(game_id))
    if detail is None:
        raise HTTPException(status_code=404, detail=_MISSING_GAME)
    return _detail_response(detail)


@router.post("/games/{game_id}/analyze", response_model=ScoreAccepted)
def score_game(
    game_id: str,
    request: Request,
    jobs: JobBook = Depends(get_job_book),
    queue: AnalysisQueue = Depends(get_analysis_queue),
    store: SqlGameStore | MemoryGameStore = Depends(get_store),
) -> ScoreAccepted:
    """Enqueue Stockfish for this game only. A game that is already queued is not started again.

    A game scored before the better move was stored is scored once more.
    """
    require_app_origin(request)
    key = _key(game_id)
    detail = store.game_detail(key)
    if detail is None:
        raise HTTPException(status_code=404, detail=_MISSING_GAME)
    if detail.card.analyzed and store.suggestions_ready(key):
        jobs.release_game(key)
        return ScoreAccepted(game_id=key, job_id=None, status="ready")
    open_id = _open_score(jobs, key)
    if open_id is not None:
        return ScoreAccepted(game_id=key, job_id=open_id, status="queued")
    enforce_rate_limit(request)
    job_id = str(uuid4())
    jobs.create(job_id, detail.username)
    jobs.update(job_id, status="queued", games_total=1, games_done=0)
    held = jobs.claim_game(key, job_id)
    if held is not None:
        return ScoreAccepted(game_id=key, job_id=held, status="queued")
    queue.enqueue_game(key, job_id)
    return ScoreAccepted(game_id=key, job_id=job_id, status="queued")


def _open_score(jobs: JobBook, game_id: str) -> str | None:
    existing = jobs.active_game(game_id)
    if existing is None:
        return None
    state = jobs.get(existing)
    if state is not None and state.status in _OPEN:
        return existing
    jobs.release_game(game_id)
    return None


def _synced_recently(store: SqlGameStore | MemoryGameStore, username: str) -> bool:
    synced = store.last_synced_at(username)
    if synced is None:
        return False
    if synced.tzinfo is None:
        synced = synced.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - synced < _FRESH_FOR


def _key(game_id: str) -> str:
    # isdigit() is true for superscripts such as ², and int() then raises.
    if len(game_id) > 12 or not game_id.isascii() or not game_id.isdecimal():
        raise HTTPException(status_code=404, detail=_MISSING_GAME)
    return str(int(game_id))


def _library_blunder(game_id: str, note: BlunderNote) -> LibraryBlunderResponse:
    return LibraryBlunderResponse(
        game_id=game_id,
        san=note.san,
        ply=note.ply,
        phase=note.phase,
        severity_cp=note.severity_cp,
        square=note.square,
        under_time_pressure=note.under_time_pressure,
        fen=note.fen,
        played_uci=note.played_uci,
        best_uci=note.best_uci,
        best_san=note.best_san,
        reply_uci=note.reply_uci,
        reply_san=note.reply_san,
    )


def _card_response(card: GameCard) -> GameCardResponse:
    return GameCardResponse(
        id=card.id,
        result=card.result,
        player_color=card.player_color,
        opponent=card.opponent,
        time_class=card.time_class,
        played_at=card.played_at,
        final_fen=card.final_fen,
        analyzed=card.analyzed,
    )


def _detail_response(detail: GameDetail) -> GameDetailResponse:
    card = _card_response(detail.card)
    return GameDetailResponse(
        **card.model_dump(),
        blunders=[
            BlunderResponse(
                san=note.san,
                ply=note.ply,
                phase=note.phase,
                severity_cp=note.severity_cp,
                square=note.square,
                under_time_pressure=note.under_time_pressure,
                fen=note.fen,
                played_uci=note.played_uci,
                best_uci=note.best_uci,
                best_san=note.best_san,
                reply_uci=note.reply_uci,
                reply_san=note.reply_san,
            )
            for note in detail.blunders
        ],
        moves=[
            ReviewMoveResponse(
                ply=move.ply,
                san=move.san,
                uci=move.uci,
                fen_before=move.fen_before,
                best_uci=move.best_uci,
                best_san=move.best_san,
                eval_cp=move.eval_cp,
                eval_mate=move.eval_mate,
                clock_seconds=move.clock_seconds,
                is_player_move=move.is_player_move,
                is_blunder=move.is_blunder,
            )
            for move in detail.moves
        ],
    )
