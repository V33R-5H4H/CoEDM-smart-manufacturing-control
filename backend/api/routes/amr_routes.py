import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.stations.amr.amr_station import amr_station

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/amr",
    tags=["amr"],
)

class AMRCommand(BaseModel):
    command: str

@router.get("/status")
async def get_amr_status():
    """Get the current connection status and telemetry of the AMR."""
    return amr_station.get_state()

@router.post("/send")
async def send_amr_command(payload: AMRCommand):
    """
    Send a raw TCP command to the AMR.
    Acts similarly to the input() from the test script.
    """
    success = await amr_station.send_command(payload.command)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send command. Is the AMR connected?")
    
    return {"status": "success", "command_sent": payload.command}
