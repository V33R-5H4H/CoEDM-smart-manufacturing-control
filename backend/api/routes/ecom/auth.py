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
import os
import secrets
JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_urlsafe(32))   # secure fallback
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
    is_admin: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def _create_token(user_id: str, email: str, is_admin: bool = False) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "is_admin": is_admin,
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
        return {
            "user_id": payload["sub"], 
            "email": payload["email"],
            "is_admin": payload.get("is_admin", False)
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_admin_user(
    user: dict = Depends(get_current_ecom_user),
) -> dict:
    """Enforce admin privileges."""
    with db_session() as session:
        is_admin = session.execute(
            text("SELECT is_admin FROM ecom_users WHERE user_id = :uid"),
            {"uid": user["user_id"]}
        ).scalar()
        if not is_admin:
            raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


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

        import html
        sanitized_name = html.escape(body.full_name)
        
        user_id = str(uuid.uuid4())
        pw_hash = _hash_password(body.password)
        session.execute(
            text("""
                INSERT INTO ecom_users (user_id, email, full_name, password_hash, created_at)
                VALUES (:uid, :email, :full_name, :pw, :now)
            """),
            {"uid": user_id, "email": body.email.lower(),
             "full_name": sanitized_name, "pw": pw_hash, "now": ist_now()}
        )

    token = _create_token(user_id, body.email.lower(), is_admin=False)
    return AuthResponse(token=token, user_id=user_id,
                        email=body.email.lower(), full_name=sanitized_name, is_admin=False)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest):
    """Authenticate an existing customer."""
    with db_session() as session:
        row = session.execute(
            text("SELECT user_id, full_name, password_hash, is_admin FROM ecom_users WHERE email = :email AND is_active"),
            {"email": body.email.lower()}
        ).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        user_id, full_name, pw_hash, is_admin = row
        if not _verify_password(body.password, pw_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        session.execute(
            text("UPDATE ecom_users SET last_login = :now WHERE user_id = :uid"),
            {"now": ist_now(), "uid": str(user_id)}
        )

    token = _create_token(str(user_id), body.email.lower(), is_admin=bool(is_admin))
    return AuthResponse(token=token, user_id=str(user_id),
                        email=body.email.lower(), full_name=full_name, is_admin=bool(is_admin))


@router.get("/me")
def me(user=Depends(get_current_ecom_user)):
    """Return current authenticated user info."""
    return user


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    """Generate a stateless reset token and log it to the terminal."""
    with db_session() as session:
        row = session.execute(
            text("SELECT user_id, full_name FROM ecom_users WHERE email = :email"),
            {"email": body.email.lower()}
        ).fetchone()

        if not row:
            # Return success even if not found to prevent email enumeration
            return {"message": "If that email is registered, a reset link has been sent."}

        user_id, full_name = row
        
        payload = {
            "sub": str(user_id),
            "purpose": "reset_password",
            "exp": datetime.utcnow() + timedelta(minutes=15),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
        
        reset_link = f"http://localhost:5174/reset-password?token={token}"
        
        # Simulate email sending by explicitly printing so start.py catches it
        print("======================================================", flush=True)
        print(f"EMAIL SIMULATION: Password Reset for {body.email}", flush=True)
        print(f"Hi {full_name}, click the link below to reset your password:", flush=True)
        print(f"{reset_link}", flush=True)
        print("======================================================", flush=True)

        return {
            "message": "If that email is registered, a reset link has been sent.",
            # For local demo convenience only, return the link to the UI
            "demo_link": reset_link
        }


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    """Validate token and update password."""
    try:
        payload = jwt.decode(body.token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("purpose") != "reset_password":
            raise HTTPException(status_code=400, detail="Invalid token purpose")
            
        user_id = payload["sub"]
        
        with db_session() as session:
            pw_hash = _hash_password(body.new_password)
            session.execute(
                text("UPDATE ecom_users SET password_hash = :pw WHERE user_id = :uid"),
                {"pw": pw_hash, "uid": user_id}
            )
            
        return {"message": "Password successfully updated"}
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=400, detail="Reset token has expired")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or corrupt reset token")
