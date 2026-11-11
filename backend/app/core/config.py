from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # backend/.env, quel que soit le dossier depuis lequel le serveur est lancé.
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore")

    database_url: str
    secret_key: str
    cors_origins: str = "http://localhost:3000"
    # À passer à true en production (HTTPS) : le cookie de session n'est alors envoyé que sur HTTPS.
    cookie_secure: bool = False

    @property
    def sqlalchemy_url(self) -> str:
        # Neon fournit « postgresql:// » ; SQLAlchemy doit savoir quel pilote utiliser.
        return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()
