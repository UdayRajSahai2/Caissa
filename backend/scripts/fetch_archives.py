import asyncio
import os
import sys

from app.adapters.chess.chesscom import ChessComClient, ChessComError
from app.core.config import get_settings
from app.domain.username import UsernameError, validate_username


def pgn_looks_valid(pgn: object) -> bool:
    if not isinstance(pgn, str):
        return False
    text = pgn.lstrip()
    has_header = text.startswith("[Event ") and "[Result " in text
    has_moves = "\n\n1." in text or " 1." in text
    return has_header and has_moves


async def main() -> None:
    raw_username = os.environ.get("CHESSCOM_USERNAME", "").strip()
    if not raw_username:
        print("Set CHESSCOM_USERNAME before running this script.")
        sys.exit(1)
    try:
        username = validate_username(raw_username)
    except UsernameError:
        print("Chess.com username is not valid.")
        sys.exit(1)

    settings = get_settings()
    async with ChessComClient(settings.chesscom_user_agent, settings.chesscom_timeout_seconds) as chess:
        try:
            archive_urls = await chess.list_archive_urls(username)
        except ChessComError as exc:
            if exc.status_code == 404:
                print("No Chess.com account was found for that username.")
            else:
                print("Chess.com could not be reached.")
            sys.exit(1)

        print(f"archives: {len(archive_urls)}")
        if not archive_urls:
            print("This account has no archived games.")
            return

        latest_url = archive_urls[-1]
        try:
            games = await chess.fetch_month_games(latest_url, username)
        except ChessComError:
            print("Chess.com could not be reached.")
            sys.exit(1)

        print(f"latest month games: {len(games)}")
        sample = next((game.get("pgn") for game in games if isinstance(game.get("pgn"), str)), None)
        if not isinstance(sample, str):
            print("no PGN found")
            return

        print(f"pgn looks valid: {pgn_looks_valid(sample)}")
        print("--- pgn head ---")
        print("\n".join(sample.splitlines()[:8]))


if __name__ == "__main__":
    asyncio.run(main())
