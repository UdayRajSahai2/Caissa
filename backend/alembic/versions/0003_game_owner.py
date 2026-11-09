"""store one Chess.com game for each player, and drop the unused jobs table

Revision ID: 0003_game_owner
Revises: 0002_fetched_archives
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_game_owner"
down_revision: str | None = "0002_fetched_archives"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    names = [
        constraint["name"]
        for constraint in inspector.get_unique_constraints("games")
        if constraint.get("column_names") == ["chesscom_game_id"] and constraint.get("name")
    ]
    with op.batch_alter_table("games") as batch:
        for name in names:
            batch.drop_constraint(name, type_="unique")
        batch.create_unique_constraint(
            "uq_games_player_chesscom_game_id",
            ["player_id", "chesscom_game_id"],
        )
    op.drop_index("ix_jobs_status", table_name="jobs")
    op.drop_index("ix_jobs_username", table_name="jobs")
    op.drop_table("jobs")


def downgrade() -> None:
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
    with op.batch_alter_table("games") as batch:
        batch.drop_constraint("uq_games_player_chesscom_game_id", type_="unique")
        batch.create_unique_constraint("games_chesscom_game_id_key", ["chesscom_game_id"])
