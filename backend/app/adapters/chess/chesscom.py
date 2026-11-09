import asyncio
import logging
from collections.abc import Awaitable, Callable

import httpx

from app.adapters.chess.urls import is_allowed_archive_url, require_allowed_archive_url
from app.domain.username import validate_username

logger = logging.getLogger(__name__)

_MAX_RESPONSE_BYTES = 20_000_000
_ARCHIVE_LIST = "https://api.chess.com/pub/player/{username}/games/archives"
_PROFILE = "https://api.chess.com/pub/player/{username}"


class ChessComError(Exception):
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code
        super().__init__(f"Chess.com returned {status_code}")


class ChessComClient:
    """Fetches monthly archives from the Chess.com public API.

    Every URL is checked against the api.chess.com allowlist before the request
    is sent. Redirects are not followed.
    """

    def __init__(
        self,
        user_agent: str,
        timeout_seconds: float,
        transport: httpx.AsyncBaseTransport | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ) -> None:
        self._user_agent = user_agent
        self._timeout_seconds = timeout_seconds
        self._transport = transport
        self._sleep = sleep or _pause
        self._client: httpx.AsyncClient | None = None

    async def open(self) -> None:
        self._client = httpx.AsyncClient(
            headers={"User-Agent": self._user_agent},
            timeout=httpx.Timeout(self._timeout_seconds, connect=5.0),
            follow_redirects=False,
            trust_env=False,
            transport=self._transport,
        )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "ChessComClient":
        await self.open()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    async def list_archive_urls(self, username: str) -> list[str]:
        validated = validate_username(username)
        payload = await self._get(_ARCHIVE_LIST.format(username=validated.casefold()), validated)
        archives = payload.get("archives", [])
        allowed: list[str] = []
        for url in archives:
            if isinstance(url, str) and _safe_or_false(url, validated):
                allowed.append(url)
            else:
                logger.warning("dropped a Chess.com archive URL that failed the allowlist")
        return allowed

    async def player_exists(self, username: str) -> bool:
        """True when Chess.com has a public profile for this username (AUTH-02). Other failures raise."""
        validated = validate_username(username)
        try:
            await self._get(_PROFILE.format(username=validated.casefold()), validated)
        except ChessComError as exc:
            if exc.status_code == 404:
                return False
            raise
        return True

    async def fetch_month_games(self, archive_url: str, username: str) -> list[dict]:
        validated = validate_username(username)
        payload = await self._get(archive_url, validated)
        games = payload.get("games", [])
        return [game for game in games if isinstance(game, dict)]

    async def _get(self, url: str, username: str) -> dict:
        if self._client is None:
            raise RuntimeError("ChessComClient.open() must be called first")
        require_allowed_archive_url(url, username)
        response = await self._get_with_backoff(url)
        if response.status_code in {301, 302, 303, 307, 308}:
            location = response.headers.get("location", "")
            if not is_allowed_archive_url(location, username):
                logger.warning("blocked a chess.com redirect that failed the allowlist")
                raise ChessComError(response.status_code)
            response = await self._get_with_backoff(location)
        if response.status_code != 200:
            logger.warning(
                "chess.com request failed status=%s host=%s",
                response.status_code,
                "api.chess.com",
            )
            raise ChessComError(response.status_code)
        if len(response.content) > _MAX_RESPONSE_BYTES:
            raise ChessComError(response.status_code)
        try:
            payload = response.json()
        except ValueError as exc:
            raise ChessComError(response.status_code) from exc
        if not isinstance(payload, dict):
            raise ChessComError(response.status_code)
        return payload

    async def _get_with_backoff(self, url: str) -> httpx.Response:
        """ING-10. A 429 waits 0.5s, 1s, then 2s. The body is never read into an error."""
        assert self._client is not None
        delay = 0.5
        response: httpx.Response | None = None
        for attempt in range(4):
            response = await self._client.get(url)
            if response.status_code != 429 or attempt == 3:
                return response
            logger.warning("chess.com rate limited host=api.chess.com")
            await self._sleep(delay)
            delay *= 2
        assert response is not None
        return response


async def _pause(seconds: float) -> None:
    await asyncio.sleep(seconds)


def _safe_or_false(url: str, username: str) -> bool:
    try:
        require_allowed_archive_url(url, username)
    except ValueError:
        return False
    return True
