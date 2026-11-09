"""GAM-01..04 and PUZ-06: a signed-in user's progress, worked out from their activity rows.

Pure functions: the same rows always give the same progress, so the rules are easy to test and
nothing is stored twice. Days are the user's local days (the browser sends its UTC offset).
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

DAILY_GOAL = 3
XP_SOLVED = 10
XP_MISSED = 2
XP_LESSON = 25
XP_REVIEW = 5
XP_GOAL_DAY = 15
FIRST_REVIEW_DAYS = 3
LEARNED_FOR_PATTERN = 5
PHASES = ("opening", "middlegame", "endgame")
# GAM-02: (name, XP needed).
RANKS: tuple[tuple[str, int], ...] = (
    ("Pawn", 0),
    ("Knight", 150),
    ("Bishop", 400),
    ("Rook", 900),
    ("Queen", 1800),
    ("King", 3500),
)
# GAM-03, in the order the progress page shows them.
BADGES = (
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


@dataclass(frozen=True)
class Activity:
    kind: str  # "puzzle" | "lesson" | "review"
    ref: str  # puzzle "game-ply", lesson slug, or game id
    player: str  # Chess.com username for puzzles, else ""
    phase: str  # puzzle phase, else ""
    correct: bool  # puzzle solved, or a reviewed game with no blunder by the player
    at: datetime


@dataclass(frozen=True)
class PuzzleState:
    ref: str
    state: str  # "due" | "later" | "learned"
    due_on: date | None


@dataclass(frozen=True)
class Progress:
    xp: int
    rank: str
    rank_xp: int
    next_rank: str | None
    next_rank_xp: int | None
    streak: int
    best_streak: int
    goal: int
    today_solved: int
    badges: tuple[str, ...]
    learned_by_phase: dict[str, int]
    lessons_done: tuple[str, ...]
    reviewed: int
    puzzles: tuple[PuzzleState, ...] = field(default_factory=tuple)


def local_day(at: datetime, offset_minutes: int) -> date:
    return (at + timedelta(minutes=offset_minutes)).date()


def compute_progress(
    events: list[Activity], today: date, offset_minutes: int, player: str | None = None
) -> Progress:
    ordered = sorted(events, key=lambda event: event.at)
    puzzles = [event for event in ordered if event.kind == "puzzle"]
    lessons = sorted({event.ref for event in ordered if event.kind == "lesson"})
    reviews = [event for event in ordered if event.kind == "review"]

    solved_by_day: dict[date, set[str]] = defaultdict(set)
    first_try: dict[tuple[str, str, date], Activity] = {}
    solved_once: set[tuple[str, str, date]] = set()
    for event in puzzles:
        day = local_day(event.at, offset_minutes)
        key = (event.player, event.ref, day)
        first_try.setdefault(key, event)
        if event.correct:
            solved_by_day[day].add(f"{event.player}:{event.ref}")
            solved_once.add(key)
    goal_days = {day for day, refs in solved_by_day.items() if len(refs) >= DAILY_GOAL}

    xp = XP_SOLVED * len(solved_once)
    xp += XP_MISSED * sum(1 for event in first_try.values() if not event.correct)
    xp += XP_LESSON * len(lessons)
    reviewed = {event.ref for event in reviews}
    xp += XP_REVIEW * len(reviewed)
    xp += XP_GOAL_DAY * len(goal_days)

    states = _puzzle_states(puzzles, offset_minutes)
    learned_by_phase = {phase: 0 for phase in PHASES}
    for (_player, _ref), (state, phase) in states.items():
        if state.state == "learned" and phase in learned_by_phase:
            learned_by_phase[phase] += 1

    current = current_streak(goal_days, today)
    best = max([current, *(streak_ending(day, goal_days) for day in goal_days)])
    rank, rank_xp, next_rank, next_rank_xp = rank_for(xp)

    earned = {
        "first_solve": bool(solved_once),
        "daily_goal": bool(goal_days),
        "streak_3": best >= 3,
        "streak_7": best >= 7,
        "comeback": _has_comeback(puzzles),
        "clean_game": any(event.correct for event in reviews),
        "student": len(lessons) >= 5,
        "scholar": len(lessons) >= 10,
        "pattern_fixed": any(count >= LEARNED_FOR_PATTERN for count in learned_by_phase.values()),
    }
    shown = tuple(
        _as_of(state, today)
        for (owner, _ref), (state, _phase) in sorted(states.items())
        if player is not None and owner == player
    )
    return Progress(
        xp=xp,
        rank=rank,
        rank_xp=rank_xp,
        next_rank=next_rank,
        next_rank_xp=next_rank_xp,
        streak=current,
        best_streak=best,
        goal=DAILY_GOAL,
        today_solved=len(solved_by_day.get(today, set())),
        badges=tuple(badge for badge in BADGES if earned[badge]),
        learned_by_phase=learned_by_phase,
        lessons_done=tuple(lessons),
        reviewed=len(reviewed),
        puzzles=shown,
    )


def rank_for(xp: int) -> tuple[str, int, str | None, int | None]:
    index = max(i for i, (_name, need) in enumerate(RANKS) if xp >= need)
    name, need = RANKS[index]
    if index + 1 < len(RANKS):
        next_name, next_need = RANKS[index + 1]
        return name, need, next_name, next_need
    return name, need, None, None


def streak_ending(day: date, met: set[date], leading_rest: bool = False) -> int:
    """GAM-01: met days counted back from `day`. One missed day per calendar week is a rest day
    when the day before it was met. A rest day is not counted, and a streak cannot start on one
    unless `leading_rest` (yesterday, while today is still open)."""
    count = 0
    rested: set[tuple[int, int]] = set()
    current = day
    while True:
        if current in met:
            count += 1
        else:
            week = current.isocalendar()[:2]
            if week in rested or (current - timedelta(days=1)) not in met or (count == 0 and not leading_rest):
                return count
            rested.add(week)
        current -= timedelta(days=1)


def current_streak(met: set[date], today: date) -> int:
    """Today does not break the streak until it is over."""
    if today in met:
        return streak_ending(today, met)
    return streak_ending(today - timedelta(days=1), met, leading_rest=True)


def _puzzle_states(
    puzzles: list[Activity], offset_minutes: int
) -> dict[tuple[str, str], tuple[PuzzleState, str]]:
    """PUZ-06. Only the first attempt per puzzle per day counts. Miss: due tomorrow. First solve:
    due in 3 days. A second solve on a later day: learned. A miss at any point starts over."""
    states: dict[tuple[str, str], tuple[PuzzleState, str]] = {}
    first_solved_on: dict[tuple[str, str], date] = {}
    seen: set[tuple[str, str, date]] = set()
    for event in puzzles:
        day = local_day(event.at, offset_minutes)
        key = (event.player, event.ref)
        if (event.player, event.ref, day) in seen:
            continue
        seen.add((event.player, event.ref, day))
        previous = states.get(key)
        if not event.correct:
            first_solved_on.pop(key, None)
            states[key] = (PuzzleState(event.ref, "due", day + timedelta(days=1)), event.phase)
        elif previous is not None and previous[0].state == "learned":
            continue
        elif key in first_solved_on and day > first_solved_on[key]:
            states[key] = (PuzzleState(event.ref, "learned", None), event.phase)
        else:
            first_solved_on[key] = day
            states[key] = (PuzzleState(event.ref, "due", day + timedelta(days=FIRST_REVIEW_DAYS)), event.phase)
    return states


def _as_of(state: PuzzleState, today: date) -> PuzzleState:
    """A scheduled puzzle is "due" once its day comes, "later" before that."""
    if state.state == "learned" or state.due_on is None or state.due_on <= today:
        return state
    return PuzzleState(state.ref, "later", state.due_on)


def _has_comeback(puzzles: list[Activity]) -> bool:
    missed: set[tuple[str, str]] = set()
    for event in puzzles:
        key = (event.player, event.ref)
        if not event.correct:
            missed.add(key)
        elif key in missed:
            return True
    return False
