import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from backend.database.db import db_session
from backend.api.routes.ecom.auth import get_current_admin_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["E-Commerce Admin"])

@router.get("/users")
def get_all_users(admin_user: dict = Depends(get_current_admin_user)):
    """Fetch all registered e-commerce customers."""
    with db_session() as session:
        rows = session.execute(
            text("""
                SELECT user_id, email, full_name, is_active, created_at, last_login, is_admin
                FROM ecom_users
                ORDER BY created_at DESC
            """)
        ).fetchall()
        
    users = []
    for r in rows:
        users.append({
            "user_id": str(r[0]),
            "email": r[1],
            "full_name": r[2],
            "is_active": r[3],
            "created_at": r[4].isoformat() if r[4] else None,
            "last_login": r[5].isoformat() if r[5] else None,
            "is_admin": r[6]
        })
    return users


@router.get("/orders")
def get_all_orders(admin_user: dict = Depends(get_current_admin_user)):
    """Fetch all orders including customer details."""
    with db_session() as session:
        # Fetch orders
        orders_rows = session.execute(
            text("""
                SELECT o.order_id, o.customer_name, o.customer_email, o.shipping_address, 
                       o.order_status, o.created_at, o.updated_at,
                       COALESCE((SELECT SUM(oi.total_price) FROM order_items oi WHERE oi.order_id = o.order_id), 0) as total_price
                FROM orders o
                ORDER BY o.created_at DESC
            """)
        ).fetchall()
        
        orders = []
        for o in orders_rows:
            order_id = o[0]
            
            # Fetch items for this order
            items_rows = session.execute(
                text("""
                    SELECT i.name, oi.quantity, oi.unit_price, oi.total_price, i.sku
                    FROM order_items oi
                    JOIN storage_items i ON i.item_id = oi.item_id
                    WHERE oi.order_id = :oid
                """),
                {"oid": order_id}
            ).fetchall()
            
            items = []
            for item in items_rows:
                items.append({
                    "name": item[0],
                    "quantity": item[1],
                    "unit_price": float(item[2]),
                    "total_price": float(item[3]),
                    "sku": item[4]
                })
                
            orders.append({
                "order_id": order_id,
                "customer_name": o[1],
                "customer_email": o[2],
                "shipping_address": o[3],
                "order_status": o[4],
                "created_at": o[5].isoformat() if o[5] else None,
                "updated_at": o[6].isoformat() if o[6] else None,
                "total_price": float(o[7]),
                "items": items
            })
            
    return orders


@router.get("/inventory")
def get_inventory_details(admin_user: dict = Depends(get_current_admin_user)):
    """Fetch all items and their exact ASRS bin locations."""
    with db_session() as session:
        rows = session.execute(
            text("""
                SELECT i.item_id, i.sku, i.name, i.price, i.item_type,
                       c.compartment_id, c.status, c.quantity
                FROM storage_items i
                LEFT JOIN storage_compartments c ON c.item_id = i.item_id
                WHERE i.item_type = 'finished'
                ORDER BY i.name ASC, c.compartment_id ASC
            """)
        ).fetchall()
        
    items_map = {}
    for r in rows:
        item_id = r[0]
        if item_id not in items_map:
            items_map[item_id] = {
                "item_id": item_id,
                "sku": r[1],
                "name": r[2],
                "price": float(r[3]),
                "item_type": r[4],
                "total_quantity": 0,
                "locations": []
            }
            
        comp_id = r[5]
        status = r[6]
        qty = r[7]
        
        if comp_id and status in ('occupied', 'reserved'):
            items_map[item_id]["total_quantity"] += qty
            items_map[item_id]["locations"].append({
                "compartment_id": comp_id,
                "status": status,
                "quantity": qty
            })
            
    return list(items_map.values())
