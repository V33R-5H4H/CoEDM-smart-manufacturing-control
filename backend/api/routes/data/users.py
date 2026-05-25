from fastapi import APIRouter, HTTPException
from backend.database.db import SessionLocal
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/data/users", tags=["Users"])

class UserCreate(BaseModel):
    username: str
    email: str
    full_name: str
    role: str = "operator"

@router.get("")
async def get_all_users():
    """Retrieve all users"""
    session = SessionLocal()
    try:
        result = session.execute(text("SELECT user_id, username, email, full_name, role, is_active, created_at FROM users ORDER BY username"))
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"success": True, "count": len(rows), "data": rows}
    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.post("")
async def create_user(payload: UserCreate):
    """Create a new user"""
    session = SessionLocal()
    try:
        # Check if email duplicate
        existing = session.execute(
            text("SELECT user_id FROM users WHERE email = :email"),
            {"email": payload.email}
        ).fetchone()
        
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")
            
        new_id = uuid.uuid4()
        session.execute(
            text("""
                INSERT INTO users (user_id, username, email, full_name, role, is_active)
                VALUES (:user_id, :username, :email, :full_name, :role, TRUE)
            """),
            {
                "user_id": new_id,
                "username": payload.username,
                "email": payload.email,
                "full_name": payload.full_name,
                "role": payload.role
            }
        )
        session.commit()
        return {
            "success": True,
            "data": {
                "user_id": str(new_id),
                "username": payload.username,
                "email": payload.email,
                "full_name": payload.full_name,
                "role": payload.role,
                "is_active": True
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
