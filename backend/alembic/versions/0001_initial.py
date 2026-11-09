"""players, games, moves, blunders, and jobs

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("chesscom_username", sa.String(length=25), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("chesscom_username"),
    )
    op.create_table(
        "games",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("player_id", sa.Integer(), sa.ForeignKey("players.id"), nullable=False),
        sa.Column("chesscom_game_id", sa.String(length=80), nullable=False),
        sa.Column("pgn", sa.Text(), nullable=False),
        sa.Column("time_control", sa.String(length=32), nullable=False),
        sa.Column("time_class", sa.String(length=16), nullable=False),
        sa.Column("result", sa.String(length=16), nullable=False),
        sa.Column("played_at", sa.DateTime(timezone=True)),
        sa.Column("raw_json", sa.JSON(), nullable=False),
        sa.Column("player_color", sa.String(length=5), nullable=False),
        sa.Column("analyzed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("chesscom_game_id"),
    )
    op.create_index("ix_games_player_id", "games", ["player_id"])
    op.create_table(
        "moves",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("game_id", sa.Integer(), sa.ForeignKey("games.id"), nullable=False),
        sa.Column("ply_number", sa.Integer(), nullable=False),
        sa.Column("move_san", sa.String(length=16), nullable=False),
        sa.Column("uci", sa.String(length=8), nullable=False),
        sa.Column("fen_before", sa.String(length=120), nullable=False),
        sa.Column("eval_cp", sa.Integer()),
        sa.Column("eval_mate", sa.Integer()),
        sa.Column("clock_remaining_seconds", sa.Integer()),
        sa.Column("is_blunder", sa.Boolean(), nullable=False),
        sa.Column("blunder_severity_cp", sa.Integer(), nullable=False),
        sa.Column("board_region", sa.String(length=8), nullable=False),
        sa.Column("is_player_move", sa.Boolean(), nullable=False),
    )
    op.create_index("ix_moves_game_id", "moves", ["game_id"])
    op.create_table(
        "blunders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("move_id", sa.Integer(), sa.ForeignKey("moves.id"), nullable=False),
        sa.Column("game_id", sa.Integer(), sa.ForeignKey("games.id"), nullable=False),
        sa.Column("player_id", sa.Integer(), sa.ForeignKey("players.id"), nullable=False),
        sa.Column("phase", sa.String(length=16), nullable=False),
        sa.Column("under_time_pressure", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("move_id"),
    )
    op.create_index("ix_blunders_game_id", "blunders", ["game_id"])
    op.create_index("ix_blunders_player_id", "blunders", ["player_id"])
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("player_id", sa.Integer(), sa.ForeignKey("players.id")),
        sa.Column("username", sa.String(length=25), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("progress_pct", sa.Integer(), nullable=False),
        sa.Column("games_done", sa.Integer(), nullable=False),
        sa.Column("games_total", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_jobs_username", "jobs", ["username"])
    op.create_index("ix_jobs_status", "jobs", ["status"])


def downgrade() -> None:
    op.drop_table("jobs")
    op.drop_table("blunders")
    op.drop_table("moves")
    op.drop_table("games")
    op.drop_table("players")
