from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str


class AnalyzeAccepted(BaseModel):
    """A queued job, or a report that is still inside the 24 hour cache. No game text."""

    model_config = ConfigDict(extra="forbid")

    username: str
    job_id: str | None
    status: str


class JobProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: str
    status: str
    progress_pct: int
    games_done: int
    games_total: int
    error_message: str | None = None


class GameCardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    result: str
    player_color: str
    opponent: str
    time_class: str
    played_at: str | None
    final_fen: str
    analyzed: bool


class GamePage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    page: int
    page_size: int
    total: int
    games: list[GameCardResponse]


class BlunderResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

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


class ReviewMoveResponse(BaseModel):
    """REV-01: one move for the game review. No PGN; eval is after the move, from White's side."""

    model_config = ConfigDict(extra="forbid")

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


class GameDetailResponse(GameCardResponse):
    blunders: list[BlunderResponse]
    moves: list[ReviewMoveResponse]


class ScoreAccepted(BaseModel):
    model_config = ConfigDict(extra="forbid")

    game_id: str
    job_id: str | None
    status: str


class LibraryBlunderResponse(BlunderResponse):
    game_id: str


class LibraryReportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    games_total: int
    games_analyzed: int
    games_scored: int
    blunders: list[LibraryBlunderResponse]


class LibraryScoreAccepted(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    status: str
    job_id: str | None
    queued: int
    games_total: int
    games_scored: int


class MyPlayers(BaseModel):
    """Chess.com usernames this signed-in user saved (AUTH-02)."""

    model_config = ConfigDict(extra="forbid")

    players: list[str]


class PuzzleStateResponse(BaseModel):
    """PUZ-06: where one of the player's puzzles is in the review schedule."""

    model_config = ConfigDict(extra="forbid")

    ref: str
    state: str
    due_on: str | None


class ProgressResponse(BaseModel):
    """GAM-01..05: the signed-in user's own progress. Private to them; no other user appears here."""

    model_config = ConfigDict(extra="forbid")

    xp: int
    rank: str
    rank_xp: int
    next_rank: str | None
    next_rank_xp: int | None
    streak: int
    best_streak: int
    goal: int
    today_solved: int
    badges: list[str]
    learned_by_phase: dict[str, int]
    lessons_done: list[str]
    reviewed: int
    puzzles: list[PuzzleStateResponse]
    xp_gained: int = 0
    new_badges: list[str] = []
    new_rank: bool = False
