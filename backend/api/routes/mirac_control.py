"""
MIRAC Control Router - FastAPI integration for VIBIT data

Endpoints:
    GET /api/control/mirac/vibit-data - Get latest VIBIT metrics
    WebSocket /ws/vibit-data - Stream VIBIT metrics in real-time
    POST /api/control/mirac/config/read-rate - Set read interval
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from backend.stations.cnc_mirac_backend import (
    mirac_gateway,
    get_vibit_data,
    set_read_interval,
)
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/control/mirac", tags=["MIRAC"])


@router.get("/vibit-data")
async def get_vibit_metrics():
    """
    Get current VIBIT sensor metrics
    
    Returns:
        {
            "timestamp": "2026-03-25T10:30:45.123456",
            "x_rms_acceleration": 2.34,
            "y_rms_acceleration": 1.56,
            ...
        }
    """
    data = get_vibit_data()
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
    """Check VIBIT data gateway connection status"""
    return {
        "connected": mirac_gateway.is_connected,
        "is_reading": mirac_gateway.is_reading,
        "read_interval_ms": int(mirac_gateway.read_interval * 1000),
        "host": mirac_gateway.host,
        "port": mirac_gateway.port,
    }

@router.post("/connect")
async def connect_mirac():
    try:
        result = mirac_gateway.connect()
        return {"success": True, "message": "MIRAC connected", "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/ws/vibit-data")
async def vibit_data_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time VIBIT metrics streaming
    
    Sends metrics every 500ms or when values change significantly
    """
    await websocket.accept()
    logger.info("VIBIT WebSocket client connected")
    
    try:
        previous_state = None
        update_interval = 0.5  # Send updates every 500ms
        
        while True:
            try:
                # Get current state
                current_state = get_vibit_data()
                
                # Only send if data changed or first message
                if current_state != previous_state:
                    message = json.dumps(current_state)
                    await websocket.send_text(message)
                    previous_state = current_state
                
                # Don't overwhelm the client
                await asyncio.sleep(update_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"WebSocket error: {e}")
                await asyncio.sleep(update_interval)
                
    except WebSocketDisconnect:
        logger.info("VIBIT WebSocket client disconnected")
    except Exception as e:
        logger.error(f"VIBIT WebSocket error: {e}")
