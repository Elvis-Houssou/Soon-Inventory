from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import sync
from ...core.db import get_session
from ...core.security import COOKIE, current_user, hash_password, set_session_cookie, verify_password
from ...models import Company, User

router = APIRouter(prefix="/api/v1")


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)
    company_name: str = Field(min_length=1, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _me(db: Session, user: User) -> dict:
    company = db.get(Company, user.company_id)
    return {"id": str(user.id), "email": user.email, "companyId": str(user.company_id), "companyName": company.name if company else ""}


@router.post("/auth/register", status_code=201)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_session)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Un compte existe déjà avec cette adresse e-mail.")
    company = Company(name=body.company_name.strip())
    db.add(company)
    db.flush()
    user = User(company_id=company.id, email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    set_session_cookie(response, user.id)
    return _me(db, user)


@router.post("/auth/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_session)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    # Même message dans les deux cas : on ne révèle pas si l'adresse existe.
    if user is None or user.status != "active" or not verify_password(user.password_hash, body.password):
        raise HTTPException(401, "Adresse e-mail ou mot de passe incorrect.")
    set_session_cookie(response, user.id)
    return _me(db, user)


@router.post("/auth/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE)


@router.get("/auth/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_session)):
    return _me(db, user)


@router.post("/sync/push")
def sync_push(body: sync.PushRequest, user: User = Depends(current_user), db: Session = Depends(get_session)):
    try:
        return {"results": sync.push(db, user, body)}
    except sync.Rejected as e:
        raise HTTPException(403, e.errors[0]) from e


@router.get("/sync/pull")
def sync_pull(cursor: int = 0, user: User = Depends(current_user), db: Session = Depends(get_session)):
    # L'entreprise vient de la session, jamais de la requête.
    return sync.pull(db, user.company_id, cursor)
