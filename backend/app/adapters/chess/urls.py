import re
from urllib.parse import unquote, urlsplit

_ALLOWED_HOST = "api.chess.com"
# The player's public profile (AUTH-02 existence check) or one of their game archives. Nothing else.
_ARCHIVE_PATH = re.compile(
    r"^/pub/player/(?P<username>[A-Za-z0-9_-]{3,25})"
    r"(?:/games(?:/archives|/(?P<year>\d{4})/(?P<month>\d{2})))?/?$"
)
_FORBIDDEN_RAW_CHARS = set("\\\r\n\t @")


class UnsafeUrlError(ValueError):
    """A URL was not an https profile or archive on api.chess.com for the requested player."""


def is_allowed_archive_url(url: str, username: str) -> bool:
    """True when `url` is a Chess.com archive we are willing to request.

    Month URLs arrive from Chess.com's JSON. This allowlist is what stops a
    tampered list from sending the server to any other host.
    """
    if not isinstance(url, str) or not url or any(char in url for char in _FORBIDDEN_RAW_CHARS):
        return False

    parsed = urlsplit(url)
    if parsed.scheme != "https":
        return False
    if parsed.hostname != _ALLOWED_HOST:
        return False
    if parsed.port not in (None, 443):
        return False
    if parsed.username is not None or parsed.password is not None:
        return False
    if parsed.query or parsed.fragment:
        return False

    match = _ARCHIVE_PATH.fullmatch(unquote(parsed.path))
    if match is None:
        return False
    if match.group("username").casefold() != username.casefold():
        return False

    month = match.group("month")
    if month is not None and not 1 <= int(month) <= 12:
        return False
    return True


def require_allowed_archive_url(url: str, username: str) -> str:
    if not is_allowed_archive_url(url, username):
        raise UnsafeUrlError
    return url
