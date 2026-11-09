"""AUTH-03: who is calling.

Browsers never call this API directly. The Next.js server checks the Auth.js session and forwards
the call with a shared secret and the signed-in user's id. Without the secret, nothing is served.
Any signed-in user may analyze any public Chess.com player (AUTH-02).
"""

import hmac
import re
from collections.abc import Iterator

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.db.activity import ActivityStore, MemoryActivityStore, SqlActivityStore
from app.db.saved_players import (
    MemorySavedPlayerStore,
    SavedPlayerStore,
    SqlSavedPlayerStore,
)
from app.db.session import session_factory

TOKEN_HEADER = "x-caissa-internal"
USER_HEADER = "x-caissa-user"
# "<provider>:<account id>" from Auth.js. Bounded and plain, so it is safe to store and log.
_USER_KEY = re.compile(r"(?:github|google):[A-Za-z0-9_-]{1,64}")

SIGN_IN_FIRST = "Sign in to use Caissa."


def current_user(request: Request) -> str:
    """The signed-in user's key. 401 for a missing or wrong secret, or a malformed user id."""
    expected: str = request.app.state.settings.internal_token
    given = request.headers.get(TOKEN_HEADER, "")
    if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail=SIGN_IN_FIRST)
    user = request.headers.get(USER_HEADER, "")
    if not _USER_KEY.fullmatch(user):
        raise HTTPException(status_code=401, detail=SIGN_IN_FIRST)
    request.state.user_key = user
    return user


def get_saved_players(request: Request) -> Iterator[SavedPlayerStore]:
    store: MemorySavedPlayerStore | None = getattr(request.app.state, "saved_players", None)
    if store is not None:
        yield store
        return
    session: Session = session_factory()()
    try:
        yield SqlSavedPlayerStore(session)
    finally:
        session.close()


def get_activity(request: Request) -> Iterator[ActivityStore]:
    store: MemoryActivityStore | None = getattr(request.app.state, "activity", None)
    if store is not None:
        yield store
        return
    session: Session = session_factory()()
    try:
        yield SqlActivityStore(session)
    finally:
        session.close()
