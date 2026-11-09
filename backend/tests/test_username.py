import pytest

from app.domain.username import UsernameError, validate_username


@pytest.mark.parametrize("username", ["hikaru", "abc", "player_one", "player-two", "A1b", "a" * 25])
def test_accepts_chesscom_usernames(username: str) -> None:
    assert validate_username(username) == username


@pytest.mark.parametrize(
    "username",
    [
        "",
        "ab",
        "a" * 26,
        "has space",
        "../etc",
        "name/extra",
        "name?x=1",
        "javascript:alert(1)",
        "user@host",
        "user\nname",
        "user;drop",
        "híkaru",
        ".",
        "..",
    ],
)
def test_rejects_untrusted_usernames(username: str) -> None:
    with pytest.raises(UsernameError):
        validate_username(username)
