from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

_engine = None


def get_engine():
    global _engine
    if _engine is None:
        url = get_settings().sqlalchemy_url
        # prepare_threshold=None : la connexion « pooled » de Neon (PgBouncer) ne supporte pas les requêtes préparées.
        args = {"prepare_threshold": None} if url.startswith("postgresql") else {}
        _engine = create_engine(url, pool_pre_ping=True, connect_args=args)
    return _engine


def get_session() -> Iterator[Session]:
    with sessionmaker(get_engine(), expire_on_commit=False)() as session:
        yield session
