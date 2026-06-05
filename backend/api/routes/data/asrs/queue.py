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

@router.delete("")
async def clear_queue():
    """Clear all pending and processing items from the retrieval queue and restore stock if needed"""
    session = SessionLocal()
    try:
        # 1. Find all offline PLC transactions that haven't been reversed
        transactions = session.execute(
            text("""
                SELECT compartment_id, item_id, tran_id, queue_id 
                FROM storage_transactions 
                WHERE asrs_result = 'ecom_db_only_plc_offline'
            """)
        ).fetchall()
        
        queue_ids = set()
        
        for tx in transactions:
            comp_id, item_id, tran_id, q_id = tx
            if q_id:
                queue_ids.add(q_id)
            
            # Restore stock
            session.execute(
                text("""
                    UPDATE storage_compartments 
                    SET status = 'occupied', item_id = :iid 
                    WHERE compartment_id = :cid
                """),
                {"iid": item_id, "cid": comp_id}
            )
            # Mark transaction as reversed
            session.execute(
                text("UPDATE storage_transactions SET asrs_result = 'reversed_clear_queue' WHERE tran_id = :tid"),
                {"tid": tran_id}
            )
            
        # 2. Add any 'pending' or 'processing' queues just in case
        pending_queues = session.execute(
            text("SELECT queue_id FROM retrieval_queue WHERE status IN ('pending', 'processing')")
        ).fetchall()
        for q in pending_queues:
            queue_ids.add(q[0])

        if not queue_ids:
            # 4. Cancel associated e-commerce orders even if queue is empty
            session.execute(
                text("UPDATE orders SET order_status = 'cancelled' WHERE order_status IN ('pending', 'processing')")
            )
            session.commit()
            return {"success": True, "message": "Queue is already empty and no offline stock to restore"}

        # 3. Cancel the queue entries
        session.execute(
            text("UPDATE retrieval_queue SET status = 'cancelled' WHERE queue_id = ANY(:qids)"),
            {"qids": list(queue_ids)}
        )

        # 4. Cancel associated e-commerce orders (if they are pending or processing)
        session.execute(
            text("UPDATE orders SET order_status = 'cancelled' WHERE order_status IN ('pending', 'processing')")
        )

        session.commit()
        return {
            "success": True, 
            "message": f"Cleared queue items and restored {len(transactions)} items to stock."
        }
    except Exception as e:
        logger.error(f"Error clearing queue: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
