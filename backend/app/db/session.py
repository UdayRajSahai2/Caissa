from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

_factory: sessionmaker[Session] | None = None


def session_factory() -> sessionmaker[Session]:
    global _factory
    if _factory is None:
        engine = create_engine(get_settings().database_url, pool_pre_ping=True)
        _factory = sessionmaker(bind=engine)
    return _factory
