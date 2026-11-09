"""replace Chess.com ownership checks with a simple saved-players list

Any signed-in user can now analyze any public Chess.com player (Chessiro model), so the
one-owner-per-username link and the profile-code challenges go. Users keep a saved list.

Revision ID: 0008_saved_players
Revises: 0007_account_ownership
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_saved_players"
down_revision: str | None = "0007_account_ownership"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_players",
        sa.Column("user_key", sa.String(length=96), primary_key=True),
        sa.Column("username", sa.String(length=25), primary_key=True),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.execute(
        sa.text("INSERT INTO saved_players (user_key, username, saved_at) SELECT user_key, username, verified_at FROM chesscom_links")
    )
    op.drop_table("ownership_challenges")
    op.drop_index("ix_chesscom_links_user_key", table_name="chesscom_links")
    op.drop_table("chesscom_links")


def downgrade() -> None:
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
    op.drop_table("saved_players")
