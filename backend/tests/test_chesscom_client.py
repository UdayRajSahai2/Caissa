import httpx
import pytest

from app.adapters.chess.chesscom import ChessComClient, ChessComError
from app.adapters.chess.urls import UnsafeUrlError

PLAYER = "hikaru"
GOOD_MONTH = "https://api.chess.com/pub/player/hikaru/games/2024/01"
INDEX = "https://api.chess.com/pub/player/hikaru/games/archives"


@pytest.mark.asyncio
async def test_archive_list_drops_urls_that_are_not_chesscom() -> None:
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        assert request.headers["user-agent"] == "Caissa-test"
        return httpx.Response(
            200,
            json={
                "archives": [
                    GOOD_MONTH,
                    "http://169.254.169.254/latest/meta-data",
                    "https://evil.example/pub/player/hikaru/games/2024/02",
                ]
            },
        )

    async with ChessComClient("Caissa-test", 5.0, transport=httpx.MockTransport(handler)) as client:
        urls = await client.list_archive_urls(PLAYER)

    assert urls == [GOOD_MONTH]
    assert requested == [INDEX]


@pytest.mark.asyncio
async def test_fetch_refuses_a_url_before_any_request() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError(f"request was sent: {request.url}")

    async with ChessComClient("Caissa-test", 5.0, transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(UnsafeUrlError):
            await client.fetch_month_games("https://evil.example/steal", PLAYER)


@pytest.mark.asyncio
async def test_non_200_does_not_return_the_response_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"secret": "do-not-leak"})

    async with ChessComClient("Caissa-test", 5.0, transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ChessComError) as caught:
            await client.list_archive_urls(PLAYER)
    assert caught.value.status_code == 404
    assert "do-not-leak" not in str(caught.value)
