"""remember which Chess.com months are already stored

Revision ID: 0002_fetched_archives
Revises: 0001_initial
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_fetched_archives"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("players", sa.Column("fetched_archives", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("players", "fetched_archives")
