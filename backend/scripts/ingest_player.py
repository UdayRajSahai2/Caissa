"""Fetch, filter, and store one player's recent games.

Reads CHESSCOM_USERNAME from the environment. Prints counts only, never PGN.
Analysis itself is queued for the worker; this script does not run Stockfish.
"""

import asyncio
import os
import sys

from app.adapters.chess.chesscom import ChessComClient
from app.core.config import get_settings
from app.db.repository import SqlGameStore
from app.db.session import session_factory
from app.services.ingest import ingest_player


async def _main(username: str) -> None:
    settings = get_settings()
    session = session_factory()()
    store = SqlGameStore(session)
    try:
        async with ChessComClient(settings.chesscom_user_agent, settings.chesscom_timeout_seconds) as client:
            result = await ingest_player(
                username=username,
                include_bullet=False,
                source=client,
                store=store,
            )
    finally:
        session.close()
    print(f"username={result.username}")
    print(f"archives={result.archive_count}")
    print(f"games_seen={result.games_seen}")
    print(f"bullet_excluded={result.bullet_excluded}")
    print(f"selected={result.selected}")
    print(f"already_stored={result.already_stored}")
    print(f"pending_analysis={len(result.pending_ids)}")


if __name__ == "__main__":
    name = os.environ.get("CHESSCOM_USERNAME", "").strip()
    if not name:
        print("Set CHESSCOM_USERNAME before running this script.", file=sys.stderr)
        sys.exit(1)
    asyncio.run(_main(name))
