from fastapi import APIRouter, HTTPException
from backend.database.db import SessionLocal
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/data/machines", tags=["Machines"])

@router.get("")
async def get_all_machines():
    """Retrieve all machines in the factory"""
    session = SessionLocal()
    try:
        result = session.execute(text("SELECT * FROM machines ORDER BY machine_id"))
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"success": True, "count": len(rows), "data": rows}
    except Exception as e:
        logger.error(f"Error fetching machines: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

@router.get("/{machine_id}/sensors")
async def get_machine_sensors(machine_id: str):
    """Retrieve all sensors attached to a machine"""
    session = SessionLocal()
    try:
        # Check if machine exists
        machine = session.execute(
            text("SELECT machine_id FROM machines WHERE machine_id = :id"),
            {"id": machine_id}
        ).fetchone()
        
        if not machine:
            raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found")
            
        result = session.execute(
            text("SELECT * FROM machine_sensors WHERE machine_id = :id ORDER BY name"),
            {"id": machine_id}
        )
        columns = result.keys()
        rows = [dict(zip(columns, row)) for row in result.fetchall()]
        return {"success": True, "count": len(rows), "data": rows}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching machine sensors: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
