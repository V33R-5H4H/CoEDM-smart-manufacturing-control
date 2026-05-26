from fastapi import APIRouter, HTTPException, Query
from backend.database.db import SessionLocal
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from backend.core.timezone import ist_now
import logging
import uuid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/queue", tags=["ASRS Retrieval Queue"])

class QueueCreate(BaseModel):
    item_id: int
    requested_by: Optional[str] = None
    priority: int = 5  # 1 (high) to 10 (low)

@router.get("")
async def get_queue(status: Optional[str] = Query(None)):
    """Retrieve items in the ASRS retrieval queue"""
    session = SessionLocal()
    try:
        query_str = "SELECT * FROM retrieval_queue"
        params = {}
        if status:
            query_str += " WHERE status = :status"
            params["status"] = status
            
        query_str += " ORDER BY priority ASC, enqueue_at ASC"
        
        result = session.execute(text(query_str), params)
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"success": True, "count": len(rows), "data": rows}
    except Exception as e:
        logger.error(f"Error fetching queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.post("")
async def push_to_queue(payload: QueueCreate):
    """Add a new retrieval job to the queue"""
    session = SessionLocal()
    try:
        # Check if item exists
        item = session.execute(
            text("SELECT item_id FROM storage_items WHERE item_id = :id"),
            {"id": payload.item_id}
        ).fetchone()
        
        if not item:
            raise HTTPException(status_code=400, detail=f"Item {payload.item_id} does not exist in master catalog")
            
        requested_by_uuid = uuid.UUID(payload.requested_by) if payload.requested_by else None
        now_dt = ist_now()
        
        # Check if there are users, otherwise use first user if requested_by is None
        if not requested_by_uuid:
            user = session.execute(text("SELECT user_id FROM users LIMIT 1")).fetchone()
            if user:
                requested_by_uuid = user[0]
                
        session.execute(
            text("""
                INSERT INTO retrieval_queue (item_id, machine_id, requested_by, status, priority, enqueue_at)
                VALUES (:item_id, 'asrs', :requested_by, 'pending', :priority, :enqueue_at)
            """),
            {
                "item_id": payload.item_id,
                "requested_by": requested_by_uuid,
                "priority": payload.priority,
                "enqueue_at": now_dt
            }
        )
        session.commit()
        return {
            "success": True,
            "message": "Job successfully pushed to retrieval queue",
            "data": {
                "item_id": payload.item_id,
                "priority": payload.priority,
                "status": "pending",
                "enqueue_at": now_dt.isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pushing to queue: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
