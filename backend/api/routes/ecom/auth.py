"""
backend/api/routes/ecom/auth.py
================================
Customer authentication for the e-commerce storefront.
Uses bcrypt password hashing + JWT bearer tokens.
"""
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy import text
import bcrypt
import jwt

from backend.database.db import db_session
from backend.core.timezone import ist_now

logger = logging.getLogger(__name__)

# ── JWT Config ────────────────────────────────────────────────────────────────
JWT_SECRET = "coedm-ecom-secret-2026"   # move to settings/.env in production
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 24

router = APIRouter(prefix="/auth")
bearer = HTTPBearer(auto_error=False)


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    full_name: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str
    full_name: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _create_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_ecom_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    """FastAPI dependency — decodes JWT and returns user dict."""
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"user_id": payload["sub"], "email": payload["email"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse)
def register(body: RegisterRequest):
    """Register a new customer account."""
    with db_session() as session:
        existing = session.execute(
            text("SELECT user_id FROM ecom_users WHERE email = :email"),
            {"email": body.email.lower()}
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")

        user_id = str(uuid.uuid4())
        pw_hash = _hash_password(body.password)
        session.execute(
            text("""
                INSERT INTO ecom_users (user_id, email, full_name, password_hash, created_at)
                VALUES (:uid, :email, :full_name, :pw, :now)
            """),
            {"uid": user_id, "email": body.email.lower(),
             "full_name": body.full_name, "pw": pw_hash, "now": ist_now()}
        )

    token = _create_token(user_id, body.email.lower())
    return AuthResponse(token=token, user_id=user_id,
                        email=body.email.lower(), full_name=body.full_name)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    """Authenticate an existing customer."""
    with db_session() as session:
        row = session.execute(
            text("SELECT user_id, full_name, password_hash FROM ecom_users WHERE email = :email AND is_active"),
            {"email": body.email.lower()}
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        user_id, full_name, pw_hash = row
        if not _verify_password(body.password, pw_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        session.execute(
            text("UPDATE ecom_users SET last_login = :now WHERE user_id = :uid"),
            {"now": ist_now(), "uid": str(user_id)}
        )

    token = _create_token(str(user_id), body.email.lower())
    return AuthResponse(token=token, user_id=str(user_id),
                        email=body.email.lower(), full_name=full_name)


@router.get("/me")
def me(user=Depends(get_current_ecom_user)):
    """Return current authenticated user info."""
    return user
