from fastapi import APIRouter, HTTPException, Body
from backend.stations.amr.amr_controller import dispatch_amr_to_station

router = APIRouter(prefix="/api/control/amr", tags=["AMR"])

@router.post("/dispatch")
async def dispatch_amr(
    station: str = Body(..., embed=True, description="The station identifier (e.g. 'A', 'B', 'C')")
):
    """
    Dispatch the AMR to a specific station.
    """
    success, message = await dispatch_amr_to_station(station)
    if not success:
        raise HTTPException(status_code=500, detail=message)
        
    return {"success": True, "message": message, "station": station}
