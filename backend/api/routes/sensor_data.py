"""
backend/api/routes/sensor_data.py — Sensor History API
=======================================================
Query endpoints for stored sensor data.

All endpoints support:
  - limit: max rows to return (default 100, max 1000)
  - offset: pagination offset (default 0)
  - start: ISO timestamp filter (optional)
  - end: ISO timestamp filter (optional)
"""

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import text
from backend.database.db import SessionLocal
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sensor-data", tags=["Sensor Data"])


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid timestamp: {value}")


# ═══════════════════════════════════════════════════════════════════════════════
# ASRS LED History
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/asrs/led-history")
async def get_led_history(
    box_id: str | None = Query(None, description="Filter by box ID, e.g. A1"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start: str | None = Query(None, description="Start timestamp (ISO format)"),
    end: str | None = Query(None, description="End timestamp (ISO format)"),
):
    """Get ASRS LED state change history."""
    session = SessionLocal()
    try:
        conditions = []
        params = {"limit": limit, "offset": offset}

        if box_id:
            conditions.append("box_id = :box_id")
            params["box_id"] = box_id

        start_dt = _parse_dt(start)
        if start_dt:
            conditions.append("changed_at >= :start")
            params["start"] = start_dt

        end_dt = _parse_dt(end)
        if end_dt:
            conditions.append("changed_at <= :end")
            params["end"] = end_dt

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        rows = session.execute(
            text(f"""
                SELECT id, box_id, active, prev_active, changed_at
                FROM sensor_asrs_led_history
                {where}
                ORDER BY changed_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        ).fetchall()

        columns = ["id", "box_id", "active", "prev_active", "changed_at"]
        return {"success": True, "count": len(rows), "data": [dict(zip(columns, r)) for r in rows]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[SensorAPI] LED history query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        session.close()


# ═══════════════════════════════════════════════════════════════════════════════
# ASRS Shuttle History
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/asrs/shuttle-history")
async def get_shuttle_history(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    """Get ASRS shuttle state change history."""
    session = SessionLocal()
    try:
        conditions = []
        params = {"limit": limit, "offset": offset}

        start_dt = _parse_dt(start)
        if start_dt:
            conditions.append("recorded_at >= :start")
            params["start"] = start_dt

        end_dt = _parse_dt(end)
        if end_dt:
            conditions.append("recorded_at <= :end")
            params["end"] = end_dt

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        rows = session.execute(
            text(f"""
                SELECT id, row_num, column_letter, state, command, recorded_at
                FROM sensor_asrs_shuttle_history
                {where}
                ORDER BY recorded_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        ).fetchall()

        columns = ["id", "row_num", "column_letter", "state", "command", "recorded_at"]
        return {"success": True, "count": len(rows), "data": [dict(zip(columns, r)) for r in rows]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[SensorAPI] Shuttle history query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        session.close()


# ═══════════════════════════════════════════════════════════════════════════════
# Hydraulic Readings
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/hydraulic/readings")
async def get_hydraulic_readings(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    """Get hydraulic sensor reading history."""
    session = SessionLocal()
    try:
        conditions = []
        params = {"limit": limit, "offset": offset}

        start_dt = _parse_dt(start)
        if start_dt:
            conditions.append("recorded_at >= :start")
            params["start"] = start_dt

        end_dt = _parse_dt(end)
        if end_dt:
            conditions.append("recorded_at <= :end")
            params["end"] = end_dt

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        rows = session.execute(
            text(f"""
                SELECT id, bearing_on, shaft_on, displacement_mm, vice_open, vice_close,
                       buzzer, safety_curtain, light_red, light_orange, light_green,
                       connected, recorded_at
                FROM sensor_hydraulic_readings
                {where}
                ORDER BY recorded_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        ).fetchall()

        columns = [
            "id", "bearing_on", "shaft_on", "displacement_mm", "vice_open", "vice_close",
            "buzzer", "safety_curtain", "light_red", "light_orange", "light_green",
            "connected", "recorded_at",
        ]
        return {"success": True, "count": len(rows), "data": [dict(zip(columns, r)) for r in rows]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[SensorAPI] Hydraulic readings query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        session.close()


# ═══════════════════════════════════════════════════════════════════════════════
# MIRAC PLC Readings
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/mirac/plc-readings")
async def get_mirac_plc_readings(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    """Get MIRAC PLC reading history."""
    session = SessionLocal()
    try:
        conditions = []
        params = {"limit": limit, "offset": offset}

        start_dt = _parse_dt(start)
        if start_dt:
            conditions.append("recorded_at >= :start")
            params["start"] = start_dt

        end_dt = _parse_dt(end)
        if end_dt:
            conditions.append("recorded_at <= :end")
            params["end"] = end_dt

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        rows = session.execute(
            text(f"""
                SELECT id, led_red, led_yellow, led_green, spindle_speed, spindle_temp,
                       spindle_vibration, tool_number, tool_temp, tool_vibration,
                       x_axis_value, z_axis_value, x_axis_feed, z_axis_feed,
                       cycle_start, cycle_stop, pneumatic_chuck, connected, recorded_at
                FROM sensor_mirac_plc_readings
                {where}
                ORDER BY recorded_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        ).fetchall()

        columns = [
            "id", "led_red", "led_yellow", "led_green", "spindle_speed", "spindle_temp",
            "spindle_vibration", "tool_number", "tool_temp", "tool_vibration",
            "x_axis_value", "z_axis_value", "x_axis_feed", "z_axis_feed",
            "cycle_start", "cycle_stop", "pneumatic_chuck", "connected", "recorded_at",
        ]
        return {"success": True, "count": len(rows), "data": [dict(zip(columns, r)) for r in rows]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[SensorAPI] MIRAC PLC readings query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        session.close()


# ═══════════════════════════════════════════════════════════════════════════════
# VIBIT Vibration Readings
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/mirac/vibit-readings")
async def get_vibit_readings(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    start: str | None = Query(None),
    end: str | None = Query(None),
):
    """Get VIBIT vibration sensor reading history."""
    session = SessionLocal()
    try:
        conditions = []
        params = {"limit": limit, "offset": offset}

        start_dt = _parse_dt(start)
        if start_dt:
            conditions.append("recorded_at >= :start")
            params["start"] = start_dt

        end_dt = _parse_dt(end)
        if end_dt:
            conditions.append("recorded_at <= :end")
            params["end"] = end_dt

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        rows = session.execute(
            text(f"""
                SELECT id, x_rms_acceleration, y_rms_acceleration, z_rms_acceleration,
                       x_rms_velocity, y_rms_velocity, z_rms_velocity,
                       x_peak_acceleration, y_peak_acceleration, z_peak_acceleration,
                       x_peak_velocity, y_peak_velocity, z_peak_velocity,
                       temperature, rpm, led_status, reboot_count, recorded_at
                FROM sensor_vibit_readings
                {where}
                ORDER BY recorded_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        ).fetchall()

        columns = [
            "id", "x_rms_acceleration", "y_rms_acceleration", "z_rms_acceleration",
            "x_rms_velocity", "y_rms_velocity", "z_rms_velocity",
            "x_peak_acceleration", "y_peak_acceleration", "z_peak_acceleration",
            "x_peak_velocity", "y_peak_velocity", "z_peak_velocity",
            "temperature", "rpm", "led_status", "reboot_count", "recorded_at",
        ]
        return {"success": True, "count": len(rows), "data": [dict(zip(columns, r)) for r in rows]}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[SensorAPI] VIBIT readings query failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        session.close()
