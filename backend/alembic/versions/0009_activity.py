"""activity rows for progress, streaks, XP, and badges (GAM-06)

Revision ID: 0009_activity
Revises: 0008_saved_players
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_activity"
down_revision: str | None = "0008_saved_players"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activity",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_key", sa.String(length=96), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("ref", sa.String(length=64), nullable=False),
        sa.Column("player", sa.String(length=25), nullable=False, server_default=""),
        sa.Column("phase", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("correct", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_activity_user_at", "activity", ["user_key", "at"])


def downgrade() -> None:
    op.drop_index("ix_activity_user_at", table_name="activity")
    op.drop_table("activity")
