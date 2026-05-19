from fastapi import APIRouter, HTTPException
from backend.stations.item_controller import ItemController

router = APIRouter(prefix="/items", tags=["Items"])


@router.get("")
async def get_items():
    """Retrieve all items"""
    try:
        data = ItemController.get_all_items()
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# NOTE: Static/specific paths MUST be declared before /{item_id} to avoid
# FastAPI treating 'available' or 'exists' as an item_id value.

@router.get("/available/with-count")
async def get_available_items_with_count():
    """Get available items with their storage count"""
    try:
        data = ItemController.get_available_items_with_count()
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_item(payload: dict):
    """Create a new item

    Request body:
    {
        "itemId": "ITEM001",
        "name": "Item Name",
        "description": "Item description"
    }
    """
    try:
        item_id = payload.get("item_id") or payload.get("itemId")
        name = payload.get("name")
        description = payload.get("description", "")

        if not name:
            raise HTTPException(status_code=400, detail="Please provide a name")
        if not item_id:
            raise HTTPException(status_code=400, detail="Please provide an item ID")
        if ItemController.check_item_id_exists(item_id):
            raise HTTPException(status_code=400, detail="Item ID already exists")

        data = ItemController.create_item(item_id, name, description)
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{item_id}")
async def get_item(item_id: str):
    """Retrieve a specific item by ID"""
    try:
        data = ItemController.get_item_by_id(item_id)
        if not data:
            raise HTTPException(status_code=404, detail="Item not found")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{item_id}")
async def delete_item(item_id: str):
    """Delete an item by ID"""
    try:
        result = ItemController.delete_item(item_id)
        return {"success": True, "message": result["message"]}
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{item_id}/locations")
async def get_item_locations(item_id: str):
    """Get all storage locations for an item"""
    try:
        data = ItemController.get_item_locations(item_id)
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{item_id}/exists")
async def check_item_id_exists(item_id: str):
    """Check if an item ID already exists"""
    try:
        exists = ItemController.check_item_id_exists(item_id)
        return {"success": True, "exists": exists}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
