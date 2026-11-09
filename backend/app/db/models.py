from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    chesscom_username: Mapped[str] = mapped_column(String(25), unique=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_archives: Mapped[list] = mapped_column(JSON, default=list)
    games: Mapped[list["Game"]] = relationship(back_populates="player")


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (
        UniqueConstraint("player_id", "chesscom_game_id", name="uq_games_player_chesscom_game_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    chesscom_game_id: Mapped[str] = mapped_column(String(80))
    pgn: Mapped[str] = mapped_column(Text)
    time_control: Mapped[str] = mapped_column(String(32), default="")
    time_class: Mapped[str] = mapped_column(String(16), default="")
    result: Mapped[str] = mapped_column(String(16), default="unknown")
    played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    raw_json: Mapped[dict] = mapped_column(JSON)
    player_color: Mapped[str] = mapped_column(String(5))
    analyzed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    player: Mapped[Player] = relationship(back_populates="games")
    moves: Mapped[list["Move"]] = relationship(back_populates="game")


class Move(Base):
    __tablename__ = "moves"
    # The report joins each blunder to the next move of the same game (the reply that punishes it).
    __table_args__ = (Index("ix_moves_game_ply", "game_id", "ply_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), index=True)
    ply_number: Mapped[int] = mapped_column(Integer)
    move_san: Mapped[str] = mapped_column(String(16))
    uci: Mapped[str] = mapped_column(String(8))
    best_uci: Mapped[str | None] = mapped_column(String(8))
    fen_before: Mapped[str] = mapped_column(String(120))
    eval_cp: Mapped[int | None] = mapped_column(Integer)
    eval_mate: Mapped[int | None] = mapped_column(Integer)
    clock_remaining_seconds: Mapped[int | None] = mapped_column(Integer)
    is_blunder: Mapped[bool] = mapped_column(Boolean, default=False)
    blunder_severity_cp: Mapped[int] = mapped_column(Integer, default=0)
    board_region: Mapped[str] = mapped_column(String(8), default="")
    is_player_move: Mapped[bool] = mapped_column(Boolean, default=False)
    game: Mapped[Game] = relationship(back_populates="moves")


class Blunder(Base):
    __tablename__ = "blunders"

    id: Mapped[int] = mapped_column(primary_key=True)
    move_id: Mapped[int] = mapped_column(ForeignKey("moves.id"), unique=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    phase: Mapped[str] = mapped_column(String(16))
    under_time_pressure: Mapped[bool] = mapped_column(Boolean, default=False)



class SavedPlayer(Base):
    """AUTH-02: a Chess.com username a signed-in user saved for quick links. Many users may save the same one."""

    __tablename__ = "saved_players"

    user_key: Mapped[str] = mapped_column(String(96), primary_key=True)
    username: Mapped[str] = mapped_column(String(25), primary_key=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ActivityRow(Base):
    """GAM-06: one puzzle attempt, finished lesson, or reviewed game by a signed-in user. Nothing else."""

    __tablename__ = "activity"
    __table_args__ = (Index("ix_activity_user_at", "user_key", "at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_key: Mapped[str] = mapped_column(String(96))
    kind: Mapped[str] = mapped_column(String(8))
    ref: Mapped[str] = mapped_column(String(64))
    player: Mapped[str] = mapped_column(String(25), default="")
    phase: Mapped[str] = mapped_column(String(16), default="")
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
