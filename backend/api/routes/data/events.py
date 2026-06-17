from fastapi import APIRouter, HTTPException, Query
from backend.database.db import SessionLocal
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
from backend.core.timezone import ist_now
import logging
import uuid
import orjson

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/data/events", tags=["Events & Alarms"])

class EventCreate(BaseModel):
    machine_id: str
    sensor_id: Optional[str] = None
    event_type: str
    severity: str = "info"  # info | warning | critical
    title: str
    payload: Optional[dict] = None

@router.get("")
async def get_all_events(
    machine_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500)
):
    """Retrieve machine events/alarms history"""
    session = SessionLocal()
    try:
        query_str = "SELECT * FROM machine_events"
        conditions = []
        params = {"limit": limit}
        
        if machine_id:
            conditions.append("machine_id = :machine_id")
            params["machine_id"] = machine_id
        if severity:
            conditions.append("severity = :severity")
            params["severity"] = severity
            
        if conditions:
            query_str += " WHERE " + " AND ".join(conditions)
            
        query_str += " ORDER BY time DESC LIMIT :limit"
        
        result = session.execute(text(query_str), params)
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"success": True, "count": len(rows), "data": rows}
    except Exception as e:
        logger.error(f"Error fetching events: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.post("")
async def create_event(payload: EventCreate):
    """Create / log a new machine event or alarm"""
    session = SessionLocal()
    try:
        # Check if machine exists
        machine = session.execute(
            text("SELECT machine_id FROM machines WHERE machine_id = :id"),
            {"id": payload.machine_id}
        ).fetchone()
        
        if not machine:
            raise HTTPException(status_code=400, detail=f"Machine {payload.machine_id} does not exist")
            
        now_dt = ist_now()
        sensor_uuid = uuid.UUID(payload.sensor_id) if payload.sensor_id else None
        
        session.execute(
            text("""
                INSERT INTO machine_events (time, machine_id, sensor_id, event_type, severity, title, payload)
                VALUES (:time, :machine_id, :sensor_id, :event_type, :severity, :title, :payload)
            """),
            {
                "time": now_dt,
                "machine_id": payload.machine_id,
                "sensor_id": sensor_uuid,
                "event_type": payload.event_type,
                "severity": payload.severity,
                "title": payload.title,
                "payload": orjson.dumps(payload.payload).decode("utf-8") if payload.payload else None
            }
        )
        session.commit()
        return {
            "success": True,
            "data": {
                "time": now_dt.isoformat(),
                "machine_id": payload.machine_id,
                "sensor_id": payload.sensor_id,
                "event_type": payload.event_type,
                "severity": payload.severity,
                "title": payload.title,
                "payload": payload.payload
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating event: {e}")
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.get("/connections")
async def get_connections(limit: int = Query(50, ge=1, le=500)):
    """Retrieve connection / disconnection history for all sensors"""
    session = SessionLocal()
    try:
        result = session.execute(
            text("SELECT * FROM machine_connections ORDER BY connected_at DESC LIMIT :limit"),
            {"limit": limit}
        )
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"success": True, "count": len(rows), "data": rows}
    except Exception as e:
        logger.error(f"Error fetching connections: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
