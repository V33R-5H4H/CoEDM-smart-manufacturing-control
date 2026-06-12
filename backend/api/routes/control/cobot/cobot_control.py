from fastapi import APIRouter, HTTPException, Body
from backend.stations.cobot.cobot_station import trigger_cobot_script
from backend.config import settings
import socket

router = APIRouter(prefix="/api/control/cobot", tags=["TM Cobot Control"])

@router.get("/connection-status")
async def get_connection_status():
    """Verify if the Cobot TCP port is open and reachable."""
    host = settings.COBOT_HOST
    port = settings.COBOT_PORT
    
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1.5)
    try:
        sock.connect((host, port))
        return {"connected": True, "host": host, "port": port}
    except Exception:
        return {"connected": False, "host": host, "port": port}
    finally:
        sock.close()

@router.post("/trigger")
async def trigger_cobot_endpoint(
    script: str = Body("ScriptExit()", embed=True, description="The TM Script string to execute")
):
    """Trigger the TM Cobot by sending a custom script block."""
    result = trigger_cobot_script(script)
    if not result["success"]:
        raise HTTPException(status_code=502, detail=result["message"])
    return result
