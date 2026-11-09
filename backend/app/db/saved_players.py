"""AUTH-02: the Chess.com usernames a signed-in user saved as theirs, for quick links. Not a permission:
any signed-in user can analyze any public Chess.com player, and many users can save the same one."""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timezone
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import SavedPlayer


class SavedPlayerStore(Protocol):
    def usernames(self, user_key: str) -> list[str]: ...

    def save(self, user_key: str, username: str) -> None: ...

    def remove(self, user_key: str, username: str) -> None: ...


class SqlSavedPlayerStore:
    def __init__(self, session: Session) -> None:
        self._session = session

    def usernames(self, user_key: str) -> list[str]:
        rows = self._session.scalars(
            select(SavedPlayer.username).where(SavedPlayer.user_key == user_key).order_by(SavedPlayer.saved_at)
        )
        return list(rows)

    def save(self, user_key: str, username: str) -> None:
        if self._session.get(SavedPlayer, (user_key, username.casefold())) is None:
            self._session.add(
                SavedPlayer(user_key=user_key, username=username.casefold(), saved_at=datetime.now(UTC))
            )
            self._session.commit()

    def remove(self, user_key: str, username: str) -> None:
        self._session.execute(
            delete(SavedPlayer).where(SavedPlayer.user_key == user_key, SavedPlayer.username == username.casefold())
        )
        self._session.commit()


@dataclass
class MemorySavedPlayerStore:
    saved: dict[str, list[str]] = field(default_factory=dict)

    def usernames(self, user_key: str) -> list[str]:
        return list(self.saved.get(user_key, []))

    def save(self, user_key: str, username: str) -> None:
        names = self.saved.setdefault(user_key, [])
        if username.casefold() not in names:
            names.append(username.casefold())

    def remove(self, user_key: str, username: str) -> None:
        names = self.saved.get(user_key, [])
        if username.casefold() in names:
            names.remove(username.casefold())
