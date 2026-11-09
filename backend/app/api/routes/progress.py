"""GAM-01..06, PUZ-06: record a signed-in user's practice and return their progress.

Every value is checked against a fixed pattern before it is stored, and rejected values are never
echoed. Progress is private: a user only ever reads and resets their own rows.
"""

import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.api.auth import current_user, get_activity
from app.api.deps import require_app_origin
from app.api.rate_limit import RateLimitExceeded
from app.api.schemas import ProgressResponse, PuzzleStateResponse
from app.db.activity import ActivityStore
from app.domain.progress import PHASES, Activity, Progress, compute_progress, local_day
from app.domain.username import UsernameError, validate_username

router = APIRouter(prefix="/me")

_PUZZLE_REF = re.compile(r"\d{1,12}-\d{1,3}")
_LESSON = re.compile(r"[a-z0-9-]{1,64}")
_GAME_ID = re.compile(r"\d{1,12}")
_OFFSET = re.compile(r"-?\d{1,3}")
_INVALID = "That progress update is not valid."


def _offset(tz: str | None) -> int:
    """The browser's UTC offset in minutes (GAM implementation note). Missing means UTC."""
    if tz is None:
        return 0
    if not _OFFSET.fullmatch(tz) or not -840 <= int(tz) <= 840:
        raise HTTPException(status_code=422, detail=_INVALID)
    return int(tz)


def _player(player: str | None, required: bool) -> str | None:
    if player is None:
        if required:
            raise HTTPException(status_code=422, detail=_INVALID)
        return None
    try:
        return validate_username(player).casefold()
    except UsernameError:
        raise HTTPException(status_code=422, detail=_INVALID) from None


def _limit(request: Request) -> None:
    require_app_origin(request)
    try:
        request.app.state.activity_limiter.check(request.state.user_key)
    except RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Too many progress updates from your account. Try again shortly.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc


def _response(progress: Progress, before: Progress | None = None) -> ProgressResponse:
    gained = progress.xp - before.xp if before is not None else 0
    new_badges = [badge for badge in progress.badges if before is not None and badge not in before.badges]
    return ProgressResponse(
        xp=progress.xp,
        rank=progress.rank,
        rank_xp=progress.rank_xp,
        next_rank=progress.next_rank,
        next_rank_xp=progress.next_rank_xp,
        streak=progress.streak,
        best_streak=progress.best_streak,
        goal=progress.goal,
        today_solved=progress.today_solved,
        badges=list(progress.badges),
        learned_by_phase=progress.learned_by_phase,
        lessons_done=list(progress.lessons_done),
        reviewed=progress.reviewed,
        puzzles=[
            PuzzleStateResponse(
                ref=item.ref, state=item.state, due_on=item.due_on.isoformat() if item.due_on else None
            )
            for item in progress.puzzles
        ],
        xp_gained=max(0, gained),
        new_badges=new_badges,
        new_rank=before is not None and progress.rank != before.rank,
    )


def _record(store: ActivityStore, user: str, activity: Activity, offset: int, player: str | None) -> ProgressResponse:
    today = local_day(activity.at, offset)
    before = compute_progress(store.events(user), today, offset, player)
    store.add(user, activity)
    after = compute_progress(store.events(user), today, offset, player)
    return _response(after, before)


@router.get("/progress", response_model=ProgressResponse)
def read_progress(
    player: str | None = None,
    tz: str | None = None,
    user: str = Depends(current_user),
    store: ActivityStore = Depends(get_activity),
) -> ProgressResponse:
    offset = _offset(tz)
    today = local_day(datetime.now(UTC), offset)
    return _response(compute_progress(store.events(user), today, offset, _player(player, required=False)))


@router.post("/activity/puzzle/{ref}/{result}", response_model=ProgressResponse)
def record_puzzle(
    ref: str,
    result: str,
    request: Request,
    player: str | None = None,
    phase: str | None = None,
    tz: str | None = None,
    user: str = Depends(current_user),
    store: ActivityStore = Depends(get_activity),
) -> ProgressResponse:
    if not _PUZZLE_REF.fullmatch(ref) or result not in ("solved", "missed") or phase not in PHASES:
        raise HTTPException(status_code=422, detail=_INVALID)
    offset = _offset(tz)
    name = _player(player, required=True)
    _limit(request)
    activity = Activity(
        kind="puzzle", ref=ref, player=name or "", phase=phase, correct=result == "solved", at=datetime.now(UTC)
    )
    return _record(store, user, activity, offset, name)


@router.post("/activity/lesson/{slug}/done", response_model=ProgressResponse)
def record_lesson(
    slug: str,
    request: Request,
    tz: str | None = None,
    user: str = Depends(current_user),
    store: ActivityStore = Depends(get_activity),
) -> ProgressResponse:
    if not _LESSON.fullmatch(slug):
        raise HTTPException(status_code=422, detail=_INVALID)
    offset = _offset(tz)
    _limit(request)
    activity = Activity(kind="lesson", ref=slug, player="", phase="", correct=True, at=datetime.now(UTC))
    return _record(store, user, activity, offset, None)


@router.post("/activity/review/{game_id}/{outcome}", response_model=ProgressResponse)
def record_review(
    game_id: str,
    outcome: str,
    request: Request,
    tz: str | None = None,
    user: str = Depends(current_user),
    store: ActivityStore = Depends(get_activity),
) -> ProgressResponse:
    if not _GAME_ID.fullmatch(game_id) or outcome not in ("clean", "blunders"):
        raise HTTPException(status_code=422, detail=_INVALID)
    offset = _offset(tz)
    _limit(request)
    activity = Activity(
        kind="review", ref=game_id, player="", phase="", correct=outcome == "clean", at=datetime.now(UTC)
    )
    return _record(store, user, activity, offset, None)


@router.post("/progress/reset", status_code=204)
def reset_progress(
    request: Request,
    user: str = Depends(current_user),
    store: ActivityStore = Depends(get_activity),
) -> Response:
    """GAM-06: delete every activity row for this user."""
    _limit(request)
    store.reset(user)
    return Response(status_code=204)
