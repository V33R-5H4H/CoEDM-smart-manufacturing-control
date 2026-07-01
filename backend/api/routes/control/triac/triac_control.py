"""
TRIAC Control Router - FastAPI integration for VIBIT data and OPC UA
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from backend.stations.triac import (
    connect_triac,
    disconnect_triac,
    get_triac_status,
)
from backend.stations.triac.cnc_triac_station import pulse_triac_command
from backend.websockets.triac_broadcaster import triac_broadcaster

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/control/triac", tags=["TRIAC"])


@router.get("/connection-status")
async def get_connection_status():
    """Check OPC UA connection status"""
    status = get_triac_status()
    return {
        "connected": status.get("connected", False),
    }


@router.post("/connect")
async def connect_triac_endpoint():
    try:
        success, message = connect_triac()
        return {"success": success, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disconnect")
async def disconnect_triac_endpoint():
    try:
        success, message = disconnect_triac()
        return {"success": success, "message": message}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pulse")
async def pulse_command(action: str = Body(..., embed=True)):
    """
    Pulse start, stop, or reset command to the TRIAC machine.
    """
    try:
        success, message = await pulse_triac_command(action)
        return {"success": success, "message": message}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/vibit-data")
async def vibit_data_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time unified TRIAC CNC and VIBIT metrics streaming.
    """
    try:
        await triac_broadcaster.connect(websocket)
        while True:
            # Keep connection open and receive optional messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("TRIAC WebSocket client disconnected")
    except Exception as e:
        logger.error(f"TRIAC WebSocket error: {e}")
    finally:
        triac_broadcaster.disconnect(websocket)
