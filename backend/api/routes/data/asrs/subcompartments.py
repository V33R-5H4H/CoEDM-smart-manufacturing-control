"""
backend/api/routes/data/asrs/subcompartments.py

Route order matters in FastAPI — all static/prefix paths must be
declared BEFORE wildcard paths like /{place}.
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from backend.crud.asrs.subcompartment import SubCompartmentController
from backend.stations.asrs.asrs_logic import ASRSLogic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subcompartments", tags=["SubCompartments"])
asrs_logic = ASRSLogic()

# Module-level asyncio lock for ASRS operations (safe: created inside the event loop)
# Using a factory so it is lazily created the first time it is needed.
_ASRS_LOCK: asyncio.Lock | None = None

def _get_lock() -> asyncio.Lock:
    global _ASRS_LOCK
    if _ASRS_LOCK is None:
        _ASRS_LOCK = asyncio.Lock()
    return _ASRS_LOCK


# ── Static / operation routes FIRST (before /{place} wildcard) ────────────────

@router.get("")
async def get_all_subcompartments():
    """Get all subcompartments"""
    try:
        data = SubCompartmentController.get_all_subcompartments()
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_subcompartment(payload: dict):
    """Create a new subcompartment

    Request body:
    {
        "boxId": "A1",
        "subId": "1",
        "itemId": "ITEM001",
        "status": "Occupied"
    }
    """
    try:
        box_id = payload.get("boxId")
        sub_id = payload.get("subId")
        item_id = payload.get("itemId")
        status = payload.get("status")

        if not box_id or sub_id is None or not status:
            raise HTTPException(
                status_code=400,
                detail="Please provide boxId, subId, and status"
            )

        try:
            sub_id_int = int(sub_id) if isinstance(sub_id, str) else sub_id
        except ValueError:
            raise HTTPException(status_code=400, detail="subId must be a number")

        subcom_place = f"{box_id}{sub_id_int}"
        data = SubCompartmentController.create_subcompartment(
            subcom_place, box_id, sub_id_int, item_id, status
        )
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/operations/test-asrs")
async def test_asrs_connection(payload: dict):
    """Test AS/RS connection and send a command.

    Request body: { "command": "A1" }
    """
    lock = _get_lock()
    if lock.locked():
        raise HTTPException(status_code=429, detail="ASRS is busy. Please wait.")
    try:
        async with lock:
            command = payload.get("command")
            if not command:
                raise HTTPException(status_code=400, detail="Please provide a command (e.g., A1, B2S)")
            from backend.stations.asrs.asrs_singleton import asrs_controller
            result = asrs_controller.process_command(command)
            return {"success": True, "data": {"command": command, "asrs_response": result}}
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AS/RS Error: {e}")


@router.post("/operations/add-product")
async def add_product_to_storage(payload: dict):
    """Store a product in the ASRS.

    Request body: { "boxId": "A1", "subId": "1", "itemId": "ITEM001" }
    """
    lock = _get_lock()
    if lock.locked():
        raise HTTPException(status_code=429, detail="ASRS is busy. Please wait.")
    try:
        async with lock:
            logger.info("add-product called: %s", payload)
            box_id = payload.get("boxId")
            sub_id = payload.get("subId")
            item_id = payload.get("itemId")

            if not box_id or sub_id is None or not item_id:
                raise HTTPException(
                    status_code=400,
                    detail="Please provide boxId, subId, and itemId"
                )

            result = asrs_logic.add_product_with_asrs(box_id, sub_id, item_id)
            logger.info("add_product result: %s", result)
            return {"success": True, "data": result}
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("Exception in add-product: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/operations/retrieve-product")
async def retrieve_product_from_storage(payload: dict):
    """Retrieve a product from the ASRS.

    Request body:
    - By quantity: { "itemId": "ITEM001", "quantity": 2 }
    - By location: { "itemId": "ITEM001", "quantity": 1, "boxId": "A1", "subId": "1" }
    """
    lock = _get_lock()
    if lock.locked():
        raise HTTPException(status_code=429, detail="ASRS is busy. Please wait.")
    try:
        async with lock:
            item_id = payload.get("itemId")
            quantity = payload.get("quantity")
            box_id = payload.get("boxId")
            sub_id = payload.get("subId")

            if box_id and sub_id:
                # Specific location retrieval
                if not item_id or not quantity:
                    raise HTTPException(
                        status_code=400,
                        detail="Please provide itemId and quantity"
                    )
                result = asrs_logic.retrieve_from_specific_location(box_id, sub_id, item_id)
                logger.info("retrieve_from_specific_location result: %s", result)
                if result.get("success"):
                    return {"success": True, "data": result}
                raise HTTPException(
                    status_code=500,
                    detail=result.get("message", "Failed to retrieve product")
                )

            # General retrieval by item ID + quantity
            if not item_id or not quantity:
                raise HTTPException(
                    status_code=400,
                    detail="Please provide itemId and quantity"
                )
            result = asrs_logic.retrieve_product_with_asrs(item_id, quantity)
            return {"success": True, "data": result}
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Wildcard routes LAST ───────────────────────────────────────────────────────

@router.get("/{place}")
async def get_subcompartment_by_place(place: str):
    """Get a subcompartment by its place code (e.g. A11)"""
    try:
        data = SubCompartmentController.get_subcompartment_by_place(place)
        if not data:
            raise HTTPException(status_code=404, detail="SubCompartment not found")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{place}/status")
async def update_subcompartment_status(place: str, payload: dict):
    """Update subcompartment status.

    Request body: { "status": "Occupied", "itemId": "ITEM001" }
    """
    try:
        status = payload.get("status")
        item_id = payload.get("itemId")
        if not status:
            raise HTTPException(status_code=400, detail="Please provide status")

        result = SubCompartmentController.update_status(place, status, item_id)
        return {"success": True, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{place}")
async def delete_subcompartment(place: str):
    """Delete a subcompartment"""
    try:
        SubCompartmentController.delete_subcompartment(place)
        return {"success": True, "message": f"SubCompartment {place} deleted"}
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))
