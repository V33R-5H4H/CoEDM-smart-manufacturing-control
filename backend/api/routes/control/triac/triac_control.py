"""
TRIAC Control Router - FastAPI integration for VIBIT data and OPC UA
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from backend.stations.triac import (
    connect_triac,
    disconnect_triac,
    get_triac_status,
)
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


@router.websocket("/ws/vibit-data")
async def vibit_data_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time unified TRIAC CNC and VIBIT metrics streaming.
    """
    await triac_broadcaster.connect(websocket)
    try:
        while True:
            # Keep connection open and receive optional messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        triac_broadcaster.disconnect(websocket)
    except Exception as e:
        triac_broadcaster.disconnect(websocket)
        logger.error(f"TRIAC WebSocket error: {e}")
        raise
