import pytest

from app.adapters.chess.urls import UnsafeUrlError, is_allowed_archive_url, require_allowed_archive_url

PLAYER = "hikaru"
GOOD = "https://api.chess.com/pub/player/hikaru/games/2024/01"


def test_allows_a_real_archive_url() -> None:
    assert is_allowed_archive_url(GOOD, PLAYER)
    assert is_allowed_archive_url("https://api.chess.com/pub/player/hikaru/games/archives", PLAYER)
    assert is_allowed_archive_url("https://api.chess.com/pub/player/Hikaru/games/2024/12", PLAYER)


@pytest.mark.parametrize(
    "url",
    [
        "http://api.chess.com/pub/player/hikaru/games/2024/01",
        "https://api.chess.com.evil.com/pub/player/hikaru/games/2024/01",
        "https://evil.example/pub/player/hikaru/games/2024/01",
        "https://user:pass@api.chess.com/pub/player/hikaru/games/2024/01",
        "https://api.chess.com:444/pub/player/hikaru/games/2024/01",
        "https://169.254.169.254/latest/meta-data",
        "file:///etc/passwd",
        "https://api.chess.com/pub/player/other/games/2024/01",
        "https://api.chess.com/pub/player/hikaru/games/2024/00",
        "https://api.chess.com/pub/player/hikaru/games/2024/13",
        "https://api.chess.com/pub/player/hikaru/games/2024/1",
        "",
        "https://api.chess.com/pub/player/hikaru/games/2024/01\n",
        "https://api.chess.com/pub/player/hikaru/games/2024/01?next=http://evil.example",
        "https://api.chess.com/pub/player/hikaru/games/2024/01#@evil.example",
        "https://api.chess.com/pub/player/hikaru/games/../../admin",
        "https://api.chess.com\\@evil.example/pub/player/hikaru/games/2024/01",
    ],
)
def test_rejects_urls_outside_the_allowlist(url: str) -> None:
    assert is_allowed_archive_url(url, PLAYER) is False
    with pytest.raises(UnsafeUrlError):
        require_allowed_archive_url(url, PLAYER)
