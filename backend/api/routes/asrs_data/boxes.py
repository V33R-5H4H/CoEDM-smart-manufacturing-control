from fastapi import APIRouter, HTTPException
from backend.stations.box_controller import BoxController
from backend.stations.asrs_singleton import asrs_controller

router = APIRouter(prefix="/boxes", tags=["Boxes"])


@router.get("/empty-compartments")
async def get_boxes_with_empty_compartments():
    """Retrieve boxes with empty compartments"""
    try:
        data = BoxController.get_boxes_with_empty_compartments()
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def get_boxes():
    """
    Retrieve all boxes with enriched data:
    - Filled subcompartment counts
    - LED active status (box busy indicator)
    """
    import logging
    try:
        
        # Get base box data
        boxes = BoxController.get_all_boxes()
        
        # Get filled subcompartment counts for each box
        filled_counts = BoxController.get_filled_counts()
        
        # Get LED states (which boxes are currently busy)
        led_states = asrs_controller.led_service.get_all_states()
        
        # Enrich box data with filled counts and LED status
        enriched = []
        for box in boxes:
            box_id = box["box_id"]
            enriched.append({
                "box_id": box_id,
                "column_name": box["column_name"],
                "row_number": box["row_number"],
                "filled_count": filled_counts.get(box_id, 0),
                "led_active": led_states.get(box_id, False)
            })
        
        return {"success": True, "count": len(enriched), "data": enriched}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"[ASRS] Unexpected error in get_boxes: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")


@router.get("/{box_id}")
async def get_box(box_id: str):
    """Retrieve a specific box"""
    try:
        data = BoxController.get_box_by_id(box_id)
        if not data:
            raise HTTPException(status_code=404, detail="Box not found")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_box(payload: dict):
    """Create a new box
    
    Request body:
    {
        "boxId": "BOX001",
        "columnName": "A",
        "rowNumber": 1
    }
    """
    try:
        box_id = payload.get("boxId")
        column_name = payload.get("columnName")
        row_number = payload.get("rowNumber")
        
        if not box_id or not column_name or row_number is None:
            raise HTTPException(
                status_code=400, 
                detail="Please provide boxId, columnName and rowNumber"
            )
        
        data = BoxController.create_box(box_id, column_name, row_number)
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{box_id}")
async def delete_box(box_id: str):
    """Delete a box by ID"""
    try:
        result = BoxController.delete_box(box_id)
        return {"success": True, "message": result["message"]}
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))
