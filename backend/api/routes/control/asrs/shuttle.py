from fastapi import APIRouter
from backend.stations.asrs.asrs_singleton import asrs_controller

router = APIRouter(prefix="/api/asrs", tags=["ASRS Shuttle"])

@router.get("/shuttle")
def get_shuttle():
    """Get current shuttle position and state"""
    return asrs_controller.shuttle.snapshot()
