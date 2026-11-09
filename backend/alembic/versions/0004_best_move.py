"""store the engine's better move beside the move that was played

Revision ID: 0004_best_move
Revises: 0003_game_owner
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_best_move"
down_revision: str | None = "0003_game_owner"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("moves", sa.Column("best_uci", sa.String(length=8), nullable=True))


def downgrade() -> None:
    op.drop_column("moves", "best_uci")
