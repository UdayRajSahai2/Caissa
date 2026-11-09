"""store which signed-in user owns which Chess.com username, and pending profile codes

Revision ID: 0007_account_ownership
Revises: 0006_move_game_ply_index
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_account_ownership"
down_revision: str | None = "0006_move_game_ply_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chesscom_links",
        sa.Column("username", sa.String(length=25), primary_key=True),
        sa.Column("user_key", sa.String(length=96), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_chesscom_links_user_key", "chesscom_links", ["user_key"])
    op.create_table(
        "ownership_challenges",
        sa.Column("user_key", sa.String(length=96), primary_key=True),
        sa.Column("username", sa.String(length=25), primary_key=True),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ownership_challenges")
    op.drop_index("ix_chesscom_links_user_key", table_name="chesscom_links")
    op.drop_table("chesscom_links")
