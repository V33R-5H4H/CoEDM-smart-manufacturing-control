"""
MIRAC Control Router - FastAPI integration for VIBIT data
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from backend.stations.mirac.cnc_mirac_station import (
    connect_mirac,
    disconnect_mirac,
    get_mirac_status,
    pulse_mirac_command,
)
from backend.websockets.mirac_broadcaster import mirac_broadcaster
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/control/mirac", tags=["MIRAC"])


@router.get("/connection-status")
async def get_connection_status():
    """Check OPC UA connection status"""
    status = get_mirac_status()
    return {
        "connected": status.get("connected", False),
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


@router.post("/pulse")
async def pulse_command(action: str = Body(..., embed=True)):
    """
    Pulse start, stop, or reset command to the MIRAC machine.
    """
    try:
        success, message = await pulse_mirac_command(action)
        return {"success": success, "message": message}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/vibit-data")
async def vibit_data_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time unified MIRAC CNC and VIBIT metrics streaming.
    """
    try:
        await mirac_broadcaster.connect(websocket)
        while True:
            # Keep connection open and receive optional messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("MIRAC WebSocket client disconnected")
    except Exception as e:
        logger.error(f"MIRAC WebSocket error: {e}")
    finally:
        mirac_broadcaster.disconnect(websocket)
