"""index moves by game and ply for the blunder reply lookup

The library report joins every blunder to the next ply of the same game. With only the
game_id index, Postgres scanned every move of the game for each blunder.

Revision ID: 0006_move_game_ply_index
Revises: 0005_mate_not_blunder
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006_move_game_ply_index"
down_revision: str | None = "0005_mate_not_blunder"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_moves_game_ply", "moves", ["game_id", "ply_number"])


def downgrade() -> None:
    op.drop_index("ix_moves_game_ply", table_name="moves")
