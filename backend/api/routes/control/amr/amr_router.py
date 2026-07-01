from fastapi import APIRouter, HTTPException, Body, WebSocket, WebSocketDisconnect
from backend.stations.amr.amr_controller import dispatch_amr_to_station
from backend.stations.amr.amr_station import amr_station
from backend.websockets.amr_broadcaster import amr_ws_manager

router = APIRouter(prefix="/api/control/amr", tags=["AMR"])

@router.post("/dispatch")
async def dispatch_amr(
    station: str = Body(..., embed=True, description="The station identifier (e.g. 'MIRAC', 'TRIAC', 'ASSEMBLY', 'HOME', 'ASRS', 'TESTING', 'INSPECTION')")
):
    """
    Dispatch the AMR to a specific station.
    """
    success, message = await dispatch_amr_to_station(station)
    if not success:
        raise HTTPException(status_code=500, detail=message)
        
    return {"success": True, "message": message, "station": station}

@router.post("/connect")
async def connect_amr():
    """Start the AMR station connection. Returns 503 if the robot is unreachable."""
    connected = await amr_station.start()
    if not connected:
        state = amr_station.get_state()
        raise HTTPException(
            status_code=503,
            detail=state.get("error") or "Failed to connect to AMR. Is the robot online?"
        )
    return {"success": True, "message": "AMR connected"}

@router.post("/disconnect")
async def disconnect_amr():
    """Stop the AMR station and close connections."""
    await amr_station.stop()
    return {"success": True, "message": "AMR connection stopped"}

@router.get("/connection-status")
async def get_amr_connection_status():
    """Get the current connection status of the AMR."""
    state = amr_station.get_state()
    return {"connected": state.get("status") != "disconnected", "status": state.get("status")}

@router.websocket("/ws")
async def amr_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time AMR status/telemetry streaming.
    """
    await amr_ws_manager.connect(websocket)
    try:
        # Send initial state sync
        await websocket.send_json({
            "type": "amr_state",
            "payload": amr_station.get_state()
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        amr_ws_manager.disconnect(websocket)
    except Exception:
        amr_ws_manager.disconnect(websocket)
