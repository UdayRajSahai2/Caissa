"""GAM-01..06 and PUZ-06: progress rules (pure) and the progress API."""

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient

from app.api.rate_limit import SlidingWindowLimiter
from app.cache.reports import MemoryReportCache
from app.core.config import Settings
from app.db.activity import MemoryActivityStore
from app.db.memory import MemoryGameStore
from app.db.saved_players import MemorySavedPlayerStore
from app.domain.progress import (
    Activity,
    compute_progress,
    current_streak,
    rank_for,
    streak_ending,
)
from app.jobs.status import MemoryJobBook
from app.main import create_app
from tests.auth_helpers import AUTH_HEADERS, OTHER_USER, TEST_TOKEN

MONDAY = date(2026, 11, 2)


def at(day: date, hour: int = 12) -> datetime:
    return datetime(day.year, day.month, day.day, hour, tzinfo=UTC)


def puzzle(
    ref: str, correct: bool, day: date, hour: int = 12, phase: str = "endgame", player: str = "magnus"
) -> Activity:
    return Activity(kind="puzzle", ref=ref, player=player, phase=phase, correct=correct, at=at(day, hour))


def goal_day(day: date) -> list[Activity]:
    return [puzzle(f"{day.toordinal()}-{n}", True, day) for n in range(3)]


# ---- streaks (GAM-01)


def test_a_streak_counts_met_days_and_today_does_not_break_it_yet() -> None:
    met = {MONDAY, MONDAY + timedelta(days=1), MONDAY + timedelta(days=2)}
    assert streak_ending(MONDAY + timedelta(days=2), met) == 3
    assert current_streak(met, MONDAY + timedelta(days=3)) == 3
    assert current_streak(met, MONDAY + timedelta(days=4)) == 3  # day 4 missed = this week's rest day
    assert current_streak(met, MONDAY + timedelta(days=5)) == 0


def test_one_missed_day_per_week_is_a_rest_day_but_two_break_the_streak() -> None:
    days = [MONDAY, MONDAY + timedelta(days=1), MONDAY + timedelta(days=3), MONDAY + timedelta(days=5)]
    met = set(days)
    # From Thursday, Wednesday is the rest day. From Saturday, Friday is, so Wednesday ends it.
    assert streak_ending(MONDAY + timedelta(days=3), met) == 3
    assert streak_ending(MONDAY + timedelta(days=5), met) == 2
    next_week = {MONDAY + timedelta(days=6), MONDAY + timedelta(days=8)}
    # Each calendar week has its own rest day: Monday (week 2) and Friday (week 1) are forgiven.
    assert streak_ending(MONDAY + timedelta(days=8), met | next_week) == 4


def test_a_streak_cannot_start_on_a_rest_day() -> None:
    assert streak_ending(MONDAY, set()) == 0
    assert streak_ending(MONDAY + timedelta(days=1), {MONDAY}) == 0


# ---- XP, ranks, goal (GAM-01, GAM-02)


def test_xp_counts_each_puzzle_once_a_day_plus_lessons_reviews_and_goal_days() -> None:
    events = [
        puzzle("1-1", False, MONDAY, 9),
        puzzle("1-1", True, MONDAY, 10),
        puzzle("1-1", True, MONDAY, 11),  # same day again: no more XP
        puzzle("1-2", True, MONDAY),
        puzzle("1-3", True, MONDAY),
        Activity("lesson", "knight-forks", "", "", True, at(MONDAY)),
        Activity("lesson", "knight-forks", "", "", True, at(MONDAY)),
        Activity("review", "77", "", "", False, at(MONDAY)),
    ]
    progress = compute_progress(events, MONDAY, 0)
    assert progress.xp == 2 + 10 * 3 + 25 + 5 + 15
    assert progress.today_solved == 3
    assert progress.streak == 1
    assert progress.lessons_done == ("knight-forks",)
    assert progress.reviewed == 1


def test_ranks_follow_the_thresholds() -> None:
    assert rank_for(0) == ("Pawn", 0, "Knight", 150)
    assert rank_for(899) == ("Bishop", 400, "Rook", 900)
    assert rank_for(5000) == ("King", 3500, None, None)


def test_days_are_the_users_local_days() -> None:
    late = Activity("puzzle", "1-1", "magnus", "endgame", True, datetime(2026, 11, 2, 20, 30, tzinfo=UTC))
    # 20:30 UTC is already 3 November in India (+330 minutes).
    india = compute_progress([late], date(2026, 11, 3), 330)
    assert india.today_solved == 1
    assert compute_progress([late], date(2026, 11, 3), 0).today_solved == 0


# ---- spaced repetition (PUZ-06)


def test_puzzles_come_back_until_solved_twice_on_different_days() -> None:
    events = [puzzle("5-10", False, MONDAY)]
    state = compute_progress(events, MONDAY, 0, "magnus").puzzles[0]
    assert (state.state, state.due_on) == ("later", MONDAY + timedelta(days=1))
    assert compute_progress(events, MONDAY + timedelta(days=1), 0, "magnus").puzzles[0].state == "due"

    events.append(puzzle("5-10", True, MONDAY + timedelta(days=1)))
    events.append(puzzle("5-10", True, MONDAY + timedelta(days=1), 18))  # same day: ignored
    state = compute_progress(events, MONDAY + timedelta(days=1), 0, "magnus").puzzles[0]
    assert (state.state, state.due_on) == ("later", MONDAY + timedelta(days=4))

    events.append(puzzle("5-10", True, MONDAY + timedelta(days=4)))
    assert compute_progress(events, MONDAY + timedelta(days=4), 0, "magnus").puzzles[0].state == "learned"


def test_a_miss_starts_a_puzzle_over_and_puzzles_are_listed_only_for_the_asked_player() -> None:
    events = [
        puzzle("5-10", True, MONDAY),
        puzzle("5-10", False, MONDAY + timedelta(days=3)),
        puzzle("9-9", True, MONDAY, player="hikaru"),
    ]
    progress = compute_progress(events, MONDAY + timedelta(days=3), 0, "magnus")
    assert [(item.ref, item.state) for item in progress.puzzles] == [("5-10", "later")]
    assert compute_progress(events, MONDAY, 0).puzzles == ()


# ---- badges (GAM-03)


def test_badges_are_earned_from_the_rows() -> None:
    events: list[Activity] = []
    for offset in range(7):
        events += goal_day(MONDAY + timedelta(days=offset))
    events += [puzzle("1-1", False, MONDAY), puzzle("1-1", True, MONDAY + timedelta(days=2))]
    events.append(Activity("review", "8", "", "", True, at(MONDAY)))
    events += [Activity("lesson", f"lesson-{n}", "", "", True, at(MONDAY)) for n in range(10)]
    for n in range(5):
        events += [puzzle(f"7-{n}", True, MONDAY), puzzle(f"7-{n}", True, MONDAY + timedelta(days=1))]
    progress = compute_progress(events, MONDAY + timedelta(days=6), 0)
    assert progress.badges == (
        "first_solve",
        "daily_goal",
        "streak_3",
        "streak_7",
        "comeback",
        "clean_game",
        "student",
        "scholar",
        "pattern_fixed",
    )
    assert progress.learned_by_phase["endgame"] >= 5
    assert compute_progress([], MONDAY, 0).badges == ()


# ---- API


def _client(limit: int = 60) -> TestClient:
    settings = Settings(
        _env_file=None,
        internal_token=TEST_TOKEN,
        rate_limit_backend="memory",
        rate_limit_activity_requests=limit,
        enable_docs=False,
    )
    app = create_app(settings)
    app.state.activity = MemoryActivityStore()
    app.state.saved_players = MemorySavedPlayerStore()
    app.state.game_store = MemoryGameStore()
    app.state.jobs = MemoryJobBook()
    app.state.report_cache = MemoryReportCache()
    app.state.activity_limiter = SlidingWindowLimiter(limit=limit, window_seconds=60)
    return TestClient(app)


def test_progress_needs_sign_in() -> None:
    client = _client()
    assert client.get("/me/progress").status_code == 401
    assert client.post("/me/activity/lesson/forks/done").status_code == 401


def test_recording_a_puzzle_returns_xp_gained_new_badges_and_the_schedule() -> None:
    client = _client()
    response = client.post(
        "/me/activity/puzzle/12-31/solved?player=Magnus&phase=endgame&tz=330", headers=AUTH_HEADERS
    )
    assert response.status_code == 200
    body = response.json()
    assert body["xp_gained"] == 10
    assert body["new_badges"] == ["first_solve"]
    assert body["today_solved"] == 1
    assert body["puzzles"][0]["ref"] == "12-31"
    assert body["puzzles"][0]["state"] == "later"
    again = client.post("/me/activity/puzzle/12-31/solved?player=magnus&phase=endgame&tz=330", headers=AUTH_HEADERS)
    assert again.json()["xp_gained"] == 0
    assert again.json()["new_badges"] == []
    read = client.get("/me/progress?player=magnus&tz=330", headers=AUTH_HEADERS).json()
    assert read["xp"] == 10 and read["xp_gained"] == 0


def test_lessons_and_reviews_add_xp_once_and_progress_is_private_and_resettable() -> None:
    client = _client()
    assert client.post("/me/activity/lesson/knight-forks/done", headers=AUTH_HEADERS).json()["xp_gained"] == 25
    assert client.post("/me/activity/lesson/knight-forks/done", headers=AUTH_HEADERS).json()["xp_gained"] == 0
    clean = client.post("/me/activity/review/42/clean", headers=AUTH_HEADERS).json()
    assert clean["xp_gained"] == 5 and clean["new_badges"] == ["clean_game"]
    other = {**AUTH_HEADERS, "x-caissa-user": OTHER_USER}
    assert client.get("/me/progress", headers=other).json()["xp"] == 0
    assert client.post("/me/progress/reset", headers=AUTH_HEADERS).status_code == 204
    assert client.get("/me/progress", headers=AUTH_HEADERS).json()["xp"] == 0


def test_bad_values_are_rejected_without_echoing_them() -> None:
    client = _client()
    bad = [
        "/me/activity/puzzle/12-31/solved?player=magnus&phase=space",
        "/me/activity/puzzle/12-31/solved?phase=endgame",
        "/me/activity/puzzle/<b>/solved?player=magnus&phase=endgame",
        "/me/activity/puzzle/12-31/maybe?player=magnus&phase=endgame",
        "/me/activity/puzzle/12-31/solved?player=a%20b&phase=endgame",
        "/me/activity/lesson/Not_A_Slug/done",
        "/me/activity/review/x1/clean",
        "/me/activity/lesson/forks/done?tz=9999",
    ]
    for path in bad:
        response = client.post(path, headers=AUTH_HEADERS)
        assert response.status_code == 422, path
        assert response.json() == {"detail": "That progress update is not valid."}
    assert client.get("/me/progress?tz=abc", headers=AUTH_HEADERS).status_code == 422


def test_activity_writes_have_their_own_per_user_limit() -> None:
    client = _client(limit=2)
    for slug in ("one", "two"):
        assert client.post(f"/me/activity/lesson/{slug}/done", headers=AUTH_HEADERS).status_code == 200
    limited = client.post("/me/activity/lesson/three/done", headers=AUTH_HEADERS)
    assert limited.status_code == 429
    assert limited.headers["retry-after"]
    other = {**AUTH_HEADERS, "x-caissa-user": OTHER_USER}
    assert client.post("/me/activity/lesson/three/done", headers=other).status_code == 200
