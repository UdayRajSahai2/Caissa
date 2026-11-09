import re

# Chess.com usernames are 3–25 characters: letters, digits, underscore, hyphen.
_USERNAME = re.compile(r"^[A-Za-z0-9_-]{3,25}$")


class UsernameError(ValueError):
    """The caller supplied a username that cannot be a Chess.com account name."""


def validate_username(value: str) -> str:
    """Return the username unchanged when it matches Chess.com's account format.

    Call this before the value is placed in a URL, a log line, or a database query.
    """
    if not isinstance(value, str) or _USERNAME.fullmatch(value) is None:
        raise UsernameError
    return value
