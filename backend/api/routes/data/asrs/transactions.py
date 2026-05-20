from fastapi import APIRouter, HTTPException, Query
from backend.crud.asrs.transaction import TransactionController

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.get("")
async def get_all_transactions(
    sort: str = Query("id_asc", description="Sort: id_asc | newest_first | added_only | retrieved_only"),
    limit: int = Query(100, description="Max number of results"),
):
    """Get all transactions with optional sort/filter"""
    try:
        data = TransactionController.get_all_transactions(sort, limit)
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_transaction(transaction_data: dict):
    """Create a single transaction record.

    Body: { "item_id": int, "action": "added|retrieved", "subcom_place": "A1a" }
    """
    try:
        if not transaction_data.get("item_id") or not transaction_data.get("action"):
            raise HTTPException(status_code=400, detail="item_id and action are required")
        data = TransactionController.create_transaction(transaction_data)
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch")
async def create_multiple_transactions(data: dict):
    """Create multiple transaction records atomically.

    Body: { "transactions": [ { "item_id": int, "action": str, "subcom_place": str }, ... ] }
    """
    try:
        transactions = data.get("transactions", [])
        if not transactions:
            return {"success": True, "count": 0, "data": []}
        for t in transactions:
            if not t.get("item_id") or not t.get("action"):
                raise HTTPException(status_code=400, detail="Each transaction needs item_id and action")
        result = TransactionController.create_multiple_transactions(transactions)
        return {"success": True, "count": len(result), "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# NOTE: /item/{item_id} MUST be before /{tran_id} so FastAPI doesn't
# try to cast "item" as an integer tran_id.
@router.get("/item/{item_id}")
async def get_transactions_by_item(item_id: str):
    """Get all transactions for a specific item"""
    try:
        data = TransactionController.get_transactions_by_item_id(item_id)
        return {"success": True, "count": len(data), "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{tran_id}")
async def get_transaction(tran_id: int):
    """Get a specific transaction by ID"""
    try:
        data = TransactionController.get_transaction_by_id(tran_id)
        if not data:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
