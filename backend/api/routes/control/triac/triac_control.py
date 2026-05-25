from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from backend.stations.triac.cnc_triac_station import opcua_connection
from backend.websockets.triac_broadcaster import triac_broadcaster
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/control/triac", tags=["TRIAC"])

@router.get("/connection-status")
async def get_connection_status():
    """Check OPC UA connection status"""
    return {
        "connected": opcua_connection.connected
    }

@router.post("/connect")
async def connect_triac_endpoint():
    try:
        opcua_connection.connect()
        return {"success": True, "message": "Connected to Triac OPC-UA server"}
    except Exception as e:
        logger.warning(f"[TRIAC] Failed to connect, falling back to simulated mode: {e}")
        return {"success": True, "message": f"Simulating Connection (Machine Offline)"}

@router.post("/disconnect")
async def disconnect_triac_endpoint():
    try:
        opcua_connection.disconnect()
        return {"success": True, "message": "Disconnected from Triac"}
    except Exception as e:
        logger.error(f"[TRIAC] Failed to disconnect: {e}")
        return {"success": False, "message": f"Disconnect failed: {str(e)}"}

@router.websocket("/ws/data")
async def websocket_triac_data(websocket: WebSocket):
    """
    WebSocket endpoint for real-time Triac and VIBIT telemetry
    """
    await triac_broadcaster.connect(websocket)
    try:
        while True:
            # Keep connection alive and handle client disconnects
            await websocket.receive_text()
    except WebSocketDisconnect:
        triac_broadcaster.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        triac_broadcaster.disconnect(websocket)
