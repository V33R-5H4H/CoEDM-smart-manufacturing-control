"""
MIRAC Control Router - FastAPI integration for VIBIT data

Endpoints:
    GET /api/control/mirac/vibit-data - Get latest VIBIT metrics
    WebSocket /ws/vibit-data - Stream VIBIT metrics in real-time
    POST /api/control/mirac/config/read-rate - Set read interval
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from backend.stations.mirac.cnc_mirac_backend import (
    mirac_gateway,
    get_vibit_data,
    set_read_interval,
)
from backend.stations.mirac.cnc_mirac_station import (
    connect_mirac,
    disconnect_mirac,
    get_mirac_status,
)
from backend.websockets.mirac_broadcaster import mirac_broadcaster
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/control/mirac", tags=["MIRAC"])


@router.get("/vibit-data")
async def get_vibit_metrics(sensor: str = None):
    """
    Get current VIBIT sensor metrics
    
    Args:
        sensor: Optional sensor ID (vibit1, vibit2, vibit3) to query a specific sensor.
                If not specified, all sensors are returned combined.
    """
    data = get_vibit_data(sensor)
    if not data:
        raise HTTPException(status_code=503, detail="VIBIT data unavailable")
    return data


@router.post("/config/read-rate")
async def set_read_rate(
    interval_ms: int = Body(..., embed=True, description="Read interval in milliseconds (100-5000)")
):
    """
    Set Modbus read interval (critical for device stability)
    
    Recommended values:
        - 100ms: Good for responsive dashboard (moderate load)
        - 500ms: Safe industrial standard (recommended)
        - 1000ms: Low load, less responsive
    
    Args:
        interval_ms: Interval in milliseconds (100-5000)
    """
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


@router.get("/connection-status")
async def get_connection_status():
    """Check OPC UA and VIBIT data gateway connection status"""
    status = get_mirac_status()
    return {
        "connected": status.get("connected", False),
        "is_reading": mirac_gateway.is_reading,
        "read_interval_ms": int(mirac_gateway.read_interval * 1000) if mirac_gateway.read_interval else 100,
        "host": mirac_gateway.host,
        "port": mirac_gateway.port,
    }

@router.post("/connect")
async def connect_mirac_endpoint():
    try:
        success, message = connect_mirac()
        return {"success": success, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/disconnect")
async def disconnect_mirac_endpoint():
    try:
        success, message = disconnect_mirac()
        return {"success": success, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/vibit-data")
async def vibit_data_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time unified MIRAC CNC and VIBIT metrics streaming.
    """
    await mirac_broadcaster.connect(websocket)
    try:
        while True:
            # Keep connection open and receive optional messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        mirac_broadcaster.disconnect(websocket)
    except Exception as e:
        mirac_broadcaster.disconnect(websocket)
        logger.error(f"MIRAC WebSocket error: {e}")
        raise
