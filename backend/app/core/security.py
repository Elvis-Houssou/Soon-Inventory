import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..models import User
from .config import get_settings
from .db import get_session

COOKIE = "si_session"
SESSION_DAYS = 30
_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def set_session_cookie(response: Response, user_id: uuid.UUID) -> None:
    s = get_settings()
    token = jwt.encode({"sub": str(user_id), "exp": datetime.now(UTC) + timedelta(days=SESSION_DAYS)}, s.secret_key, algorithm="HS256")
    # HttpOnly : le JavaScript de la page ne peut pas lire le jeton.
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax", secure=s.cookie_secure)


def current_user(si_session: str | None = Cookie(default=None), db: Session = Depends(get_session)) -> User:
    try:
        payload = jwt.decode(si_session or "", get_settings().secret_key, algorithms=["HS256"])
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        user = None
    if user is None or user.status != "active":
        raise HTTPException(401, "Connectez-vous pour continuer.")
    return user
