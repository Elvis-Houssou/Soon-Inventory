import os

# Les tests n'utilisent jamais la base Neon : tout tourne sur SQLite en mémoire.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-secret-key-test-secret-key-test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.db import get_session
from app.main import app
from app.models import Base


@pytest.fixture
def make_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)

    def session():
        with factory() as s:
            yield s

    app.dependency_overrides[get_session] = session

    def new_client(email: str | None = None) -> TestClient:
        """Chaque client a ses propres cookies : un client = un appareil connecté."""
        c = TestClient(app)
        if email:
            r = c.post("/api/v1/auth/register", json={"email": email, "password": "motdepasse1", "company_name": email.split("@")[0]})
            assert r.status_code == 201, r.text
        return c

    yield new_client
    app.dependency_overrides.clear()
    engine.dispose()
