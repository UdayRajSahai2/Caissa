"""un-tag checkmating moves that were stored as blunders

Stockfish scores a mated position as "mate 0" and python-chess reports mate() == 0 for
both sides, so a checkmate delivered by White was read as White being mated and saved as
a huge blunder. The judge now checks the board (domain/blunder.py). This clears the rows
already stored. A move whose SAN ends in "#" delivered checkmate, so it cannot be a blunder.

Revision ID: 0005_mate_not_blunder
Revises: 0004_best_move
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_mate_not_blunder"
down_revision: str | None = "0004_best_move"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM blunders WHERE move_id IN "
            "(SELECT id FROM moves WHERE is_blunder AND move_san LIKE '%#')"
        )
    )
    op.execute(
        sa.text(
            "UPDATE moves SET is_blunder = false, blunder_severity_cp = 0 "
            "WHERE is_blunder AND move_san LIKE '%#'"
        )
    )


def downgrade() -> None:
    # Data fix only: the wrong tags are not restored.
    pass
