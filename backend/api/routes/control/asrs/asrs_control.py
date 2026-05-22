from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from backend.stations.asrs.asrs_singleton import asrs_controller
import logging

router = APIRouter(prefix="/api/control/asrs", tags=["ASRS Control"])

controller = asrs_controller

@router.post("/run")
async def run_asrs_command(payload: dict):
    """Execute an ASRS command
    
    Request body:
    {
        "command": "A1"  # or "A1S" for store operation
    }
    """
    try:
        command = payload.get("command")
        if not command:
            raise ValueError("Command is required")
        
        result = controller.process_command(command)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/shuttle_state")
async def get_shuttle_state():
    """Get the current state of the shuttle"""
    try:
        state = controller.get_shuttle_state()
        return state
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/home")
async def reset_shuttle_home():
    """
    Manually reset shuttle state to Home (A7).
    Useful when the physical PLC has been restarted and backend is out of sync.
    If connected to the PLC, it also physically dispatches the shuttle to home position.
    """
    try:
        # If connected to the PLC, physically dispatch the shuttle to Home without getting box A7
        if controller.is_connected():
            logging.info("[ASRS] PLC is connected, triggering physical HOME command.")
            controller.run("HOME")
        else:
            logging.info("[ASRS] PLC is disconnected. Performing logical reset of shuttle to Home (A7) only.")

        controller.shuttle.reset_home()
        # Broadcast the new state to all clients
        from backend.websockets.asrs_broadcaster import led_ws_manager
        state = controller.shuttle.snapshot()
        await led_ws_manager.broadcast_shuttle_state(
            state['row'], state['column'], state['state'], state['command']
        )
        return {"success": True, "message": "Shuttle reset to Home (A7)", "state": state}
    except Exception as e:
        logging.error(f"[ASRS] Error during homing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/disconnect")
async def disconnect_server():
    """Disconnect from the OPC-UA server."""
    try:
        controller.disconnect()
        return {"success": True, "message": "Disconnected from OPC-UA server."}
    except Exception as e:
        logging.error(f"[ASRS] Error during disconnection: {e}")
        return {"success": False, "message": str(e)}


@router.post("/connect")
async def connect_server():
    """Connect to the OPC-UA server."""
    try:
        controller.connect()
        return {"success": True, "message": "Connected to OPC-UA server."}
    except Exception as e:
        logging.error(f"[ASRS] Error during connection: {e}")
        return {"success": False, "message": str(e)}


@router.get("/connection-status")
async def get_connection_status():
    """Get the connection status of the OPC-UA server."""
    try:
        status = controller.is_connected()
        logging.info(f"[ASRS] Connection status check: {status}")
        return {"connected": status}
    except Exception as e:
        logging.error(f"[ASRS] Error checking connection status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# LED STATUS ENDPOINTS - Real-time box busy monitoring
# ============================================================================

@router.get("/led-status")
async def get_led_status():
    """
    Get current LED states for all boxes.
    
    Returns:
        dict: Dictionary mapping LED names to boolean values
        Example: {"K1_1_R1": true, "K1_1_R2": false, ...}
    
    LED states indicate which boxes are currently busy (being accessed).
    True = LED is ON (box is busy), False = LED is OFF (box is available).
    """
    try:
        states = controller.get_led_states()
        return states
    except Exception as e:
        logging.error(f"[ASRS] Error getting LED states: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/led-status")
async def led_status_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time LED status updates.
    
    Clients connect to this endpoint to receive live updates when LED states change.
    The connection manager broadcasts changes to all connected clients automatically.
    
    Protocol:
    1. Client connects to ws://host/api/control/asrs/ws/led-status
    2. Server sends full LED state immediately upon connection
    3. Server broadcasts updates whenever any LED changes
    4. Messages are JSON: {"led_name": "K1_1_R1", "value": true}
    """
    from backend.websockets.asrs_broadcaster import led_ws_manager
    
    # Register this connection with the manager (manager will accept the connection)
    await led_ws_manager.connect(websocket)
    logging.info(f"[ASRS] WebSocket client connected from {websocket.client}")
    
    # Send initial snapshot of all LED states
    led_states = controller.led_service.get_all_states()
    await led_ws_manager.send_snapshot(websocket, led_states)
    
    try:
        # Keep the connection alive and listen for client messages
        # (We don't expect any, but need to keep the loop running)
        while True:
            data = await websocket.receive_text()
            # Echo back or ignore - this is primarily a broadcast channel
            logging.debug(f"[ASRS] Received WebSocket message: {data}")
            
    except WebSocketDisconnect:
        logging.info(f"[ASRS] WebSocket client disconnected")
        # Manager will clean up automatically on next broadcast
        
    except Exception as e:
        logging.error(f"[ASRS] WebSocket error: {e}")
        # Manager will clean up automatically on next broadcast
