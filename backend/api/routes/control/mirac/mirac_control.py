"""
MIRAC Control Router — FastAPI integration for dual-slave VIBIT data

Endpoints:
    GET  /api/control/mirac/vibit-data          Merged spindle+tool data
    GET  /api/control/mirac/vibit-data/unit/1   Slave 1 (spindle) raw data
    GET  /api/control/mirac/vibit-data/unit/2   Slave 2 (tool/bearing) raw data
    GET  /api/control/mirac/connectivity        Per-device connectivity status
    GET  /api/control/mirac/connection-status   Gateway status (legacy)
    POST /api/control/mirac/connect
    POST /api/control/mirac/disconnect
    POST /api/control/mirac/config/read-rate    Set read interval ms
    WS   /api/control/mirac/ws/vibit-data       Real-time merged stream
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from backend.stations.mirac.cnc_mirac_backend import (
    mirac_gateway,
    get_vibit_data,
    get_vibit_unit_data,
    get_vibit_connectivity,
    set_read_interval,
)
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/control/mirac", tags=["MIRAC"])


# ── Data endpoints ──────────────────────────────────────────────────────────

@router.get("/vibit-data")
async def get_vibit_metrics():
    """
<<<<<<< HEAD
    Get current VIBIT sensor metrics
    
<<<<<<< HEAD
    Args:
        sensor: Optional sensor ID (vibit1, vibit2, vibit3) to query a specific sensor.
                If not specified, all sensors are returned combined.
=======
    Get merged VIBIT metrics (spindle slave 1 + tool slave 2).

    Returns:
        All spindle-side fields (x_rms_acceleration, …) plus tool-side
        fields prefixed with 'tool_' (tool_x_rms_acceleration, …) and
        connectivity booleans (connected, vibit2_connected).
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849
=======
    Returns:
        {
            "timestamp": "2026-03-25T10:30:45.123456",
            "x_rms_acceleration": 2.34,
            "y_rms_acceleration": 1.56,
            ...
        }
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)
    """
    data = get_vibit_data()
    if not data:
        raise HTTPException(status_code=503, detail="VIBIT data unavailable")
    return data


@router.get("/vibit-data/unit/{unit_id}")
async def get_vibit_unit_metrics(unit_id: int):
    """
    Get raw VIBIT metrics for a specific Modbus slave unit.

    Args:
        unit_id: 1 (spindle sensor) or 2 (tool/bearing sensor)
    """
    if unit_id not in (1, 2):
        raise HTTPException(status_code=400, detail="unit_id must be 1 or 2")
    data = get_vibit_unit_data(unit_id)
    if not data:
        raise HTTPException(
            status_code=503,
            detail=f"VIBIT unit {unit_id} data unavailable"
        )
    return data


@router.get("/connectivity")
async def get_connectivity():
    """
    Per-device connectivity status for the MIRAC station.

    Returns:
        {
          host, port,
          vibit1: { unit_id, label, connected },
          vibit2: { unit_id, label, connected },
          opcua:  { url, connected },
          any_connected: bool
        }
    """
    return get_vibit_connectivity()


# ── Legacy status endpoint ──────────────────────────────────────────────────

@router.get("/connection-status")
async def get_connection_status():
    """Check VIBIT data gateway status (legacy — use /connectivity for detail)."""
    conn = get_vibit_connectivity()
    return {
        "status": "connected" if conn["any_connected"] else "disconnected",
        "connected": conn["any_connected"],
        "is_reading": mirac_gateway.is_reading,
        "read_interval_ms": int(mirac_gateway.read_interval * 1000),
        "host": mirac_gateway.host,
        "port": mirac_gateway.port,
        "vibit1_connected": conn["vibit1"]["connected"],
        "vibit2_connected": conn["vibit2"]["connected"],
        "opcua_connected": conn["opcua"]["connected"],
    }


# ── Lifecycle ───────────────────────────────────────────────────────────────

@router.post("/connect")
async def connect_mirac():
    """Connect to MIRAC OPC-UA and start dual-slave VIBIT Modbus reads."""
    try:
        result = mirac_gateway.connect()
        return {"success": True, "message": "MIRAC connected", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disconnect")
async def disconnect_mirac():
    """Disconnect from MIRAC OPC-UA and stop VIBIT reads."""
    try:
        result = mirac_gateway.disconnect()
        return {"success": True, "message": "MIRAC disconnected", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Config ──────────────────────────────────────────────────────────────────

@router.post("/config/read-rate")
async def set_read_rate(
    interval_ms: int = Body(
        ..., embed=True,
        description="Read interval in milliseconds (100–5000)"
    )
):
    """Set Modbus read interval. 500ms is the recommended safe default."""
    try:
        set_read_interval(interval_ms)
        return {
            "success": True,
            "message": f"Read interval set to {interval_ms}ms",
            "interval_ms": interval_ms,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── WebSocket ───────────────────────────────────────────────────────────────

@router.websocket("/ws/vibit-data")
async def vibit_data_websocket(websocket: WebSocket):
    """Real-time merged VIBIT metrics stream (10Hz cadence)."""
    await websocket.accept()
    logger.info("VIBIT WebSocket client connected")
    try:
        while True:
            try:
                payload = {
                    "merged": get_vibit_data(),
                    "unit1": get_vibit_unit_data(1),
                    "unit2": get_vibit_unit_data(2),
                }
                await websocket.send_text(json.dumps(payload, default=str))
                await asyncio.sleep(0.1)
            except asyncio.CancelledError:
                break
            except RuntimeError as e:
                if "close message has been sent" in str(e) or "Unexpected state" in str(e):
                    break
                logger.error(f"WebSocket RuntimeError: {e}")
                break
            except Exception as e:
                import traceback
                logger.error(f"WebSocket loop error: {e}\n{traceback.format_exc()}")
                break
    except WebSocketDisconnect:
        logger.info("VIBIT WebSocket client disconnected")
    except Exception as e:
        logger.error(f"VIBIT WebSocket error: {e}")
