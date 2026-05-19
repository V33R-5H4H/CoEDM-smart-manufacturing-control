from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from backend.stations.hydraulic_station import run_hydraulic, HYDRAULIC_TAGS, opcua_connection
from backend.websockets.hydraulic_broadcaster import hydraulic_broadcaster

router = APIRouter(prefix="/api/control/assembly", tags=["Assembly Control"])

@router.post("/run")
async def run_assembly_command(payload: dict):
    """Execute an assembly (hydraulic) command
    
    Request body:
    {
        "command": "BEARING_ON"  # or "SHAFT_ON"
    }
    """
    try:
        command = payload.get("command")
        if not command:
            raise ValueError("Command is required")
        
        command = command.strip().upper()
        
        if command not in HYDRAULIC_TAGS:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid command. Available commands: {list(HYDRAULIC_TAGS.keys())}"
            )
        
        # Pass command name, not tag - run_hydraulic will handle the mapping
        result = run_hydraulic(command)
        
        return {
            "success": result.get("success", True),
            "command": result.get("command"),
            "tag": result.get("tag"),
            "message": result.get("message")
        }
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.post("/connect")
async def connect_server():
    """Connect to the hydraulic OPC-UA server."""
    try:
        opcua_connection.connect()
        return {"success": True, "message": "Connected to OPC-UA server."}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.post("/disconnect")
async def disconnect_server():
    """Disconnect from the hydraulic OPC-UA server."""
    try:
        opcua_connection.disconnect()
        return {"success": True, "message": "Disconnected from OPC-UA server."}
    except Exception as e:
        return {"success": False, "message": str(e)}


@router.get("/connection-status")
async def get_connection_status():
    """Get the connection status of the hydraulic OPC-UA server."""
    try:
        status = opcua_connection.connected
        return {"connected": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/hydraulic-data")
async def hydraulic_data_websocket(websocket: WebSocket):
    """WebSocket endpoint for real-time hydraulic data updates (extension, bearing, shaft, etc.)"""
    await hydraulic_broadcaster.connect(websocket)
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        hydraulic_broadcaster.disconnect(websocket)
    except Exception as e:
        hydraulic_broadcaster.disconnect(websocket)
        raise


