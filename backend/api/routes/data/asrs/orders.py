from fastapi import APIRouter, HTTPException
from backend.crud.asrs.order import OrderController

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.post("")
async def create_order(payload: dict):
    """Create a new order
    
    Request body:
    {
        "customer_name": "John Doe",
        "customer_email": "john@example.com",
        "customer_phone": "1234567890",
        "shipping_address": "123 Main St",
        "items": [
            {"item_id": "ITEM001", "quantity": 2, "price": 50.00},
            {"item_id": "ITEM002", "quantity": 1, "price": 100.00}
        ],
        "total_amount": 200.00,  # Optional - will be calculated if not provided
        "order_status": "pending"  # Optional
    }
    """
    try:
        order = OrderController.create_order(payload)
        return {"success": True, "message": "Order created successfully", "data": order}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def get_all_orders(limit: int = 100):
    """Get all orders with items summary"""
    try:
        orders = OrderController.get_all_orders(limit)
        return {"success": True, "count": len(orders), "data": orders}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# NOTE: /status/{status} MUST be declared before /{order_id} to prevent
# FastAPI from routing "status" as an order_id value.
@router.get("/status/{status}")
async def get_orders_by_status(status: str):
    """Get orders by status
    
    Valid statuses: pending, processing, shipped, delivered, cancelled
    """
    try:
        orders = OrderController.get_orders_by_status(status)
        return {"success": True, "count": len(orders), "data": orders}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_order_stats():
    """Get order statistics"""
    try:
        stats = OrderController.get_order_stats()
        return {"success": True, "data": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{order_id}")
async def get_order(order_id: str):
    """Get order by ID with detailed items"""
    try:
        order = OrderController.get_order_by_id(order_id)
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        return {"success": True, "data": order}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{order_id}/status")
async def update_order_status(order_id: str, payload: dict):
    """Update order status
    
    Request body:
    {
        "status": "processing"  # One of: pending, processing, shipped, delivered, cancelled
    }
    """
    try:
        status = payload.get("status")
        if not status:
            raise HTTPException(status_code=400, detail="Please provide order status")
        
        result = OrderController.update_order_status(order_id, status)
        return {"success": True, "message": f"Order {order_id} status updated to {status}"}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=500, detail=str(e))
