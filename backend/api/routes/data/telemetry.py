from fastapi import APIRouter, HTTPException, Query
from backend.database.db import SessionLocal
from sqlalchemy import text
from typing import Optional
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/data/telemetry", tags=["Telemetry & Time-Series Data"])

@router.get("/{machine_id}")
async def get_machine_telemetry(machine_id: str, limit: int = Query(100, ge=1, le=1000)):
    """Retrieve historical time-series telemetry data for a machine (limits to last 100 rows by default)"""
    session = SessionLocal()
    try:
        # Check if machine exists
        machine = session.execute(
            text("SELECT machine_id FROM machines WHERE machine_id = :id"),
            {"id": machine_id}
        ).fetchone()
        
        if not machine:
            raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found")
            
        data = []
        if machine_id == "assembly":
            result = session.execute(
                text("SELECT * FROM assembly_station_data ORDER BY time DESC LIMIT :limit"),
                {"limit": limit}
            )
            columns = result.keys()
            data = [dict(zip(columns, row)) for row in result.fetchall()]
            
        elif machine_id in ("mirac", "triac"):
            # Fetch latest 100 rows of mirac/triac_sensor_data, vibit_readings, and energy_meter_data
            result_plc = session.execute(
                text(f"SELECT * FROM {machine_id}_sensor_data ORDER BY time DESC LIMIT :limit"),
                {"limit": limit}
            )
            columns_plc = result_plc.keys()
            rows_plc = [dict(zip(columns_plc, row)) for row in result_plc.fetchall()]
            
            result_vib = session.execute(
                text("SELECT * FROM vibit_readings WHERE machine_id = :machine_id ORDER BY time DESC LIMIT :limit"),
                {"machine_id": machine_id, "limit": limit * 2} # fetch double to cover both spindle & tool
            )
            columns_vib = result_vib.keys()
            rows_vib = [dict(zip(columns_vib, row)) for row in result_vib.fetchall()]
            
            result_energy = session.execute(
                text("SELECT * FROM energy_meter_data WHERE machine_id = :machine_id ORDER BY time DESC LIMIT :limit"),
                {"machine_id": machine_id, "limit": limit}
            )
            columns_energy = result_energy.keys()
            rows_energy = [dict(zip(columns_energy, row)) for row in result_energy.fetchall()]
            
            data = {
                "plc": rows_plc,
                "vibit": rows_vib,
                "energy": rows_energy
            }
        else:
            # Check if there is placeholder data for other machines (triac, amr, cobot)
            table_name = f"{machine_id}_sensor_data"
            try:
                result = session.execute(
                    text(f"SELECT * FROM {table_name} ORDER BY time DESC LIMIT :limit"),
                    {"limit": limit}
                )
                columns = result.keys()
                data = [dict(zip(columns, row)) for row in result.fetchall()]
            except Exception:
                # Table might not exist or be active
                data = []
                
        return {"success": True, "count": len(data) if isinstance(data, list) else len(data.get("plc", [])), "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching telemetry for machine {machine_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
