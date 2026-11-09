"""AUTH-02: the signed-in user's saved Chess.com usernames. Saving checks the player exists on Chess.com."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.adapters.chess.chesscom import ChessComClient, ChessComError
from app.api.auth import current_user, get_saved_players
from app.api.deps import enforce_rate_limit, get_source
from app.api.schemas import MyPlayers
from app.db.saved_players import SavedPlayerStore
from app.domain.username import UsernameError, validate_username

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/me")

_INVALID = "Chess.com username is not valid."
_NO_PLAYER = "No Chess.com account was found for that username. Check the spelling."
_CHESSCOM_DOWN = "Chess.com did not answer. Try again in a minute."


def _validated(username: str) -> str:
    try:
        return validate_username(username)
    except UsernameError:
        raise HTTPException(status_code=422, detail=_INVALID) from None


@router.get("/players", response_model=MyPlayers)
def my_players(user: str = Depends(current_user), saved: SavedPlayerStore = Depends(get_saved_players)) -> MyPlayers:
    return MyPlayers(players=saved.usernames(user))


@router.post("/players/{username}/save", response_model=MyPlayers)
async def save_player(
    username: str,
    request: Request,
    user: str = Depends(current_user),
    saved: SavedPlayerStore = Depends(get_saved_players),
    source: ChessComClient = Depends(get_source),
) -> MyPlayers:
    """One small profile read (bounded by the client timeout, rate-limited per user) to check the player exists.
    Game downloads and Stockfish stay in the workers."""
    validated = _validated(username)
    enforce_rate_limit(request)
    try:
        exists = await source.player_exists(validated)
    except ChessComError:
        raise HTTPException(status_code=502, detail=_CHESSCOM_DOWN) from None
    if not exists:
        raise HTTPException(status_code=404, detail=_NO_PLAYER)
    saved.save(user, validated)
    logger.info("saved a chess.com player username=%s", validated)
    return MyPlayers(players=saved.usernames(user))


@router.post("/players/{username}/remove", status_code=204)
def remove_player(
    username: str,
    user: str = Depends(current_user),
    saved: SavedPlayerStore = Depends(get_saved_players),
) -> Response:
    saved.remove(user, _validated(username))
    return Response(status_code=204)
