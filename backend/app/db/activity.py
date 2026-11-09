"""GAM-06: a signed-in user's activity rows. Progress is worked out from them (app/domain/progress.py)."""

from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import ActivityRow
from app.domain.progress import Activity

# A year of daily practice is far below this; the cap keeps one request bounded.
MAX_ROWS = 20_000


class ActivityStore(Protocol):
    def add(self, user_key: str, activity: Activity) -> None: ...

    def events(self, user_key: str) -> list[Activity]: ...

    def reset(self, user_key: str) -> None: ...


class SqlActivityStore:
    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, user_key: str, activity: Activity) -> None:
        self._session.add(
            ActivityRow(
                user_key=user_key,
                kind=activity.kind,
                ref=activity.ref,
                player=activity.player,
                phase=activity.phase,
                correct=activity.correct,
                at=activity.at,
            )
        )
        self._session.commit()

    def events(self, user_key: str) -> list[Activity]:
        rows = self._session.scalars(
            select(ActivityRow).where(ActivityRow.user_key == user_key).order_by(ActivityRow.at.desc()).limit(MAX_ROWS)
        )
        return [
            Activity(kind=row.kind, ref=row.ref, player=row.player, phase=row.phase, correct=row.correct, at=row.at)
            for row in rows
        ]

    def reset(self, user_key: str) -> None:
        self._session.execute(delete(ActivityRow).where(ActivityRow.user_key == user_key))
        self._session.commit()


@dataclass
class MemoryActivityStore:
    rows: dict[str, list[Activity]] = field(default_factory=dict)

    def add(self, user_key: str, activity: Activity) -> None:
        self.rows.setdefault(user_key, []).append(activity)

    def events(self, user_key: str) -> list[Activity]:
        return list(self.rows.get(user_key, []))

    def reset(self, user_key: str) -> None:
        self.rows.pop(user_key, None)
