"""
backend/database/db.py — Database Engine & Session Factory
===========================================================
Single engine for the entire application.

Provides:
  - engine          : SQLAlchemy Engine with pool tuning
  - SessionLocal    : session factory for raw/manual sessions
  - Base            : declarative base for ORM models
  - get_db()        : FastAPI Depends-compatible session generator
  - verify_db()     : health-check helper used at startup
"""

import logging
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

from backend.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine — one per process, shared across all sessions
# ---------------------------------------------------------------------------
engine = create_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_pre_ping=True,      # cheaply verify connection liveness before use
    echo=settings.DB_ECHO,   # set DB_ECHO=true in .env to log every SQL
)

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ---------------------------------------------------------------------------
# ORM declarative base
# ---------------------------------------------------------------------------
Base = declarative_base()

# ---------------------------------------------------------------------------
# FastAPI Depends-compatible session generator
# ---------------------------------------------------------------------------
def get_db():
    """
    Yield a database session and guarantee cleanup.

    Usage in a route:
        from backend.database.db import get_db
        from fastapi import Depends

        @router.get("/example")
        def example(db = Depends(get_db)):
            result = db.execute(text("SELECT 1"))
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Context-manager version for non-route code
# ---------------------------------------------------------------------------
@contextmanager
def db_session():
    """
    Context manager for use outside FastAPI dependency injection.

    Usage:
        from backend.database.db import db_session

        with db_session() as session:
            session.execute(text("SELECT 1"))
    """
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ---------------------------------------------------------------------------
# Startup health-check helper
# ---------------------------------------------------------------------------
def verify_db() -> dict:
    """
    Run a lightweight connectivity check against PostgreSQL.

    Returns a dict with keys:
        ok      : bool   — True if connection succeeded
        message : str    — Human-readable status
        url     : str    — Redacted DATABASE_URL (password masked)

    Used by the /api/health endpoint and the startup event handler.
    """
    # Mask the password in the URL for safe logging
    try:
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(settings.DATABASE_URL)
        masked = parsed._replace(netloc=parsed.netloc.replace(
            f":{parsed.password}@", ":****@"
        ) if parsed.password else parsed.netloc)
        safe_url = urlunparse(masked)
    except Exception:
        safe_url = "<unparseable>"

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("[DB] Connection verified: %s", safe_url)
        return {"ok": True, "message": "PostgreSQL connection OK", "url": safe_url}
    except Exception as exc:
        logger.error("[DB] Connection FAILED (%s): %s", safe_url, exc)
        return {
            "ok": False,
            "message": f"PostgreSQL connection failed: {exc}",
            "url": safe_url,
        }


# Exported for backward compatibility (inventory_db.py imports DATABASE_URL)
DATABASE_URL: str = settings.DATABASE_URL