import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text

from backend.database.db import db_session
from backend.api.routes.ecom.auth import get_current_admin_user

from pydantic import BaseModel
from typing import Optional
from backend.stations.asrs.asrs_singleton import asrs_controller
from backend.stations.asrs.asrs_logic import ASRSLogic
from backend.database.inventory_db import InventorySessionLocal
from backend.core.timezone import ist_now

logger = logging.getLogger(__name__)
asrs_logic = ASRSLogic()

router = APIRouter(prefix="/admin", tags=["E-Commerce Admin"])


class UpdateStatusRequest(BaseModel):
    status: str


@router.get("/plc-status")
def get_plc_status(admin_user: dict = Depends(get_current_admin_user)):
    """Check live connection status to Omron ASRS PLC."""
    connected = asrs_controller.is_connected()
    return {
        "plc_connected": connected,
        "machine_id": "asrs",
        "plc_endpoint": "10.10.14.104:4840",
        "status_text": "Online — Ready for Automated Shuttle Dispatch" if connected else "Offline / Simulation Mode"
    }


@router.post("/orders/{order_id}/dispatch")
def manual_dispatch_order(order_id: int, admin_user: dict = Depends(get_current_admin_user)):
    """
    Manually trigger ASRS retrieval for an order whose shuttle retrieval was pending or failed.
    """
    with db_session() as session:
        order = session.execute(text("SELECT order_id, order_status FROM orders WHERE order_id = :oid"), {"oid": order_id}).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        # Find pending retrieval queue items
        queue_rows = session.execute(text("""
            SELECT queue_id, item_id, notes, status 
            FROM retrieval_queue 
            WHERE notes LIKE :note_pat AND status IN ('pending', 'processing')
        """), {"note_pat": f"%order #{order_id}%"}).fetchall()

        if not queue_rows:
            # Also check if order items exist without queue
            items_rows = session.execute(text("SELECT item_id, quantity FROM order_items WHERE order_id = :oid"), {"oid": order_id}).fetchall()
            return {"message": "No pending ASRS retrieval tasks found for this order.", "dispatched_count": 0}

        plc_connected = asrs_controller.is_connected()
        dispatched = []

        for q in queue_rows:
            qid, iid, note, qstatus = q
            comp_id = ""
            if "compartment: " in (note or ""):
                comp_id = note.split("compartment: ")[1].strip()

            plc_ok = False
            if plc_connected and comp_id:
                box_id = comp_id[:-1]
                sub_id = comp_id[-1]
                result = asrs_logic.retrieve_from_specific_location(box_id, sub_id, iid)
                plc_ok = result.get("success", False)
                if plc_ok:
                    session.execute(text("UPDATE retrieval_queue SET status='completed', processed_at=:now WHERE queue_id=:qid"), {"now": ist_now(), "qid": qid})
                    session.execute(text("""
                        INSERT INTO storage_transactions
                            (machine_id, time, compartment_id, item_id, action, quantity, queue_id, asrs_command, asrs_result, notes)
                        VALUES ('asrs', :now, :comp, :iid, 'retrieve', 1, :qid, :cmd, 'ecom_ok', 'Admin manual dispatch')
                    """), {"now": ist_now(), "comp": comp_id, "iid": iid, "qid": qid, "cmd": box_id})

            dispatched.append({"queue_id": qid, "compartment": comp_id, "plc_ok": plc_ok})

        # Update order status to shipped if any were dispatched or completed
        session.execute(text("UPDATE orders SET order_status='processing', updated_at=:now WHERE order_id=:oid"), {"now": ist_now(), "oid": order_id})
        session.commit()

        return {
            "order_id": order_id,
            "plc_connected": plc_connected,
            "dispatched": dispatched,
            "message": f"Dispatched {len(dispatched)} retrieval items." if plc_connected else "Retried allocation. ASRS PLC is currently offline."
        }


@router.patch("/orders/{order_id}/status")
def update_order_status(order_id: int, body: UpdateStatusRequest, admin_user: dict = Depends(get_current_admin_user)):
    """Update order status directly."""
    allowed = ["pending", "processing", "shipped", "delivered", "cancelled"]
    new_status = body.status.lower()
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {allowed}")

    with db_session() as session:
        res = session.execute(
            text("UPDATE orders SET order_status = :status, updated_at = :now WHERE order_id = :oid"),
            {"status": new_status, "now": ist_now(), "oid": order_id}
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Order not found")
        session.commit()

    return {"order_id": order_id, "status": new_status, "message": f"Order status updated to {new_status}"}


class CreateUserAdminRequest(BaseModel):
    email: str
    full_name: str
    password: str
    is_admin: bool = False


class UpdateUserAdminRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


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


@router.post("/users")
def admin_create_user(body: CreateUserAdminRequest, admin_user: dict = Depends(get_current_admin_user)):
    """Provision a new user account directly from Admin."""
    import uuid
    from backend.api.routes.ecom.auth import _hash_password

    clean_email = body.email.strip().lower()
    clean_name  = body.full_name.strip()

    if not clean_email or not clean_name or not body.password:
        raise HTTPException(status_code=400, detail="All fields are required")

    hashed = _hash_password(body.password)
    user_id = str(uuid.uuid4())

    with db_session() as session:
        existing = session.execute(
            text("SELECT user_id FROM ecom_users WHERE email = :email"),
            {"email": clean_email}
        ).fetchone()

        if existing:
            raise HTTPException(status_code=409, detail="A user with this email already exists")

        session.execute(text("""
            INSERT INTO ecom_users
                (user_id, email, full_name, password_hash, is_active, is_admin, created_at, updated_at)
            VALUES
                (:uid, :email, :name, :hash, TRUE, :is_admin, :now, :now)
        """), {
            "uid": user_id,
            "email": clean_email,
            "name": clean_name,
            "hash": hashed,
            "is_admin": body.is_admin,
            "now": ist_now(),
        })
        session.commit()

    return {
        "user_id": user_id,
        "email": clean_email,
        "full_name": clean_name,
        "is_admin": body.is_admin,
        "message": f"User {clean_name} provisioned successfully."
    }


@router.patch("/users/{user_id}")
def admin_update_user(user_id: str, body: UpdateUserAdminRequest, admin_user: dict = Depends(get_current_admin_user)):
    """Update user role, active status, or details."""
    with db_session() as session:
        user = session.execute(
            text("SELECT user_id, email, is_admin, is_active FROM ecom_users WHERE user_id = :uid"),
            {"uid": user_id}
        ).fetchone()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        updates = []
        params = {"uid": user_id, "now": ist_now()}

        if body.full_name is not None:
            updates.append("full_name = :full_name")
            params["full_name"] = body.full_name.strip()

        if body.email is not None:
            updates.append("email = :email")
            params["email"] = body.email.strip().lower()

        if body.is_admin is not None:
            # Prevent admin from removing their own admin status
            if str(admin_user.get("user_id")) == str(user_id) and not body.is_admin:
                raise HTTPException(status_code=400, detail="Cannot revoke your own admin status")
            updates.append("is_admin = :is_admin")
            params["is_admin"] = body.is_admin

        if body.is_active is not None:
            if str(admin_user.get("user_id")) == str(user_id) and not body.is_active:
                raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
            updates.append("is_active = :is_active")
            params["is_active"] = body.is_active

        if not updates:
            return {"message": "No changes specified"}

        updates.append("updated_at = :now")
        sql = f"UPDATE ecom_users SET {', '.join(updates)} WHERE user_id = :uid"
        session.execute(text(sql), params)
        session.commit()

    return {"user_id": user_id, "message": "User updated successfully"}


@router.delete("/users/{user_id}")
def admin_delete_user(user_id: str, admin_user: dict = Depends(get_current_admin_user)):
    """Delete a user account."""
    if str(admin_user.get("user_id")) == str(user_id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    with db_session() as session:
        res = session.execute(
            text("DELETE FROM ecom_users WHERE user_id = :uid"),
            {"uid": user_id}
        )
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        session.commit()

    return {"user_id": user_id, "message": "User account deleted successfully"}


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


class ItemCreateRequest(BaseModel):
    sku: str
    name: str
    description: Optional[str] = ""
    price: float
    item_type: str = "finished"
    unit: str = "pcs"
    image_url: Optional[str] = None
    box_id: Optional[str] = None
    sub_slot: Optional[str] = "a"
    initial_qty: Optional[int] = 0


class ItemUpdateRequest(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    item_type: Optional[str] = None
    unit: Optional[str] = None
    image_url: Optional[str] = None


class CompartmentAllocationRequest(BaseModel):
    box_id: str
    sub_slot: str = "a"
    quantity: int
    status: str = "occupied"


@router.get("/inventory")
def get_inventory_details(admin_user: dict = Depends(get_current_admin_user)):
    """Fetch all items and their exact ASRS bin locations."""
    with db_session() as session:
        rows = session.execute(
            text("""
                SELECT i.item_id, i.sku, i.name, i.price, i.item_type,
                       c.compartment_id, c.status, c.quantity, i.image_url, i.description, i.unit
                FROM storage_items i
                LEFT JOIN storage_compartments c ON c.item_id = i.item_id
                ORDER BY i.item_id ASC, c.compartment_id ASC
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
                "image_url": r[8],
                "description": r[9] or "",
                "unit": r[10] or "pcs",
                "total_quantity": 0,
                "locations": []
            }
            
        comp_id = r[5]
        status = r[6]
        qty = r[7] or 0
        
        if comp_id and status in ('occupied', 'reserved') and qty > 0:
            items_map[item_id]["total_quantity"] += qty
            items_map[item_id]["locations"].append({
                "compartment_id": comp_id,
                "status": status,
                "quantity": qty
            })
            
    return list(items_map.values())


@router.get("/items")
def get_all_items(admin_user: dict = Depends(get_current_admin_user)):
    """Fetch item master catalogue with aggregated ASRS stock."""
    return get_inventory_details(admin_user)


@router.post("/items")
def admin_create_item(body: ItemCreateRequest, admin_user: dict = Depends(get_current_admin_user)):
    """Create a new item in the item master catalogue and optionally allocate initial ASRS stock."""
    with db_session() as session:
        clean_sku = body.sku.strip().upper()
        clean_name = body.name.strip()
        
        if not clean_sku or not clean_name:
            raise HTTPException(status_code=400, detail="SKU and Name are required")
            
        existing = session.execute(text("SELECT item_id FROM storage_items WHERE sku = :sku"), {"sku": clean_sku}).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail=f"An item with SKU '{clean_sku}' already exists")
            
        # Get next item_id
        max_id = session.execute(text("SELECT COALESCE(MAX(item_id), 100) FROM storage_items")).scalar()
        new_id = max_id + 1
        
        session.execute(text("""
            INSERT INTO storage_items 
                (item_id, machine_id, sku, name, description, item_type, unit, price, image_url, created_at, updated_at)
            VALUES 
                (:iid, 'asrs', :sku, :name, :desc, :type, :unit, :price, :img, NOW(), NOW())
        """), {
            "iid": new_id,
            "sku": clean_sku,
            "name": clean_name,
            "desc": body.description,
            "type": body.item_type,
            "unit": body.unit,
            "price": body.price,
            "img": body.image_url
        })
        
        # Optional initial compartment allocation
        if body.box_id and body.initial_qty and body.initial_qty > 0:
            sub = (body.sub_slot or "a").lower()
            session.execute(text("""
                UPDATE storage_compartments 
                SET item_id = :iid, quantity = :qty, status = 'occupied', updated_at = NOW()
                WHERE box_id = :box AND sub_slot = :sub
            """), {
                "iid": new_id,
                "qty": body.initial_qty,
                "box": body.box_id.strip().upper(),
                "sub": sub
            })
            
        session.commit()
        
    return {"message": f"Item '{clean_name}' ({clean_sku}) created successfully.", "item_id": new_id}


@router.patch("/items/{item_id}")
def admin_update_item(item_id: int, body: ItemUpdateRequest, admin_user: dict = Depends(get_current_admin_user)):
    """Update item metadata, specs, pricing, and images."""
    with db_session() as session:
        item = session.execute(text("SELECT item_id FROM storage_items WHERE item_id = :iid"), {"iid": item_id}).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
            
        updates = []
        params = {"iid": item_id}
        
        if body.sku is not None:
            updates.append("sku = :sku")
            params["sku"] = body.sku.strip().upper()
        if body.name is not None:
            updates.append("name = :name")
            params["name"] = body.name.strip()
        if body.description is not None:
            updates.append("description = :desc")
            params["desc"] = body.description
        if body.price is not None:
            updates.append("price = :price")
            params["price"] = body.price
        if body.item_type is not None:
            updates.append("item_type = :type")
            params["type"] = body.item_type
        if body.unit is not None:
            updates.append("unit = :unit")
            params["unit"] = body.unit
        if body.image_url is not None:
            updates.append("image_url = :img")
            params["img"] = body.image_url
            
        if not updates:
            return {"message": "No changes requested."}
            
        updates.append("updated_at = NOW()")
        sql = f"UPDATE storage_items SET {', '.join(updates)} WHERE item_id = :iid"
        session.execute(text(sql), params)
        session.commit()
        
    return {"message": f"Item #{item_id} updated successfully."}


@router.delete("/items/{item_id}")
def admin_delete_item(item_id: int, admin_user: dict = Depends(get_current_admin_user)):
    """Delete an item from master catalog and clear its compartments."""
    with db_session() as session:
        # Check order references
        in_orders = session.execute(text("SELECT COUNT(*) FROM order_items WHERE item_id = :iid"), {"iid": item_id}).scalar()
        if in_orders > 0:
            raise HTTPException(status_code=400, detail="Cannot delete item that has existing orders associated with it. Please edit or archive it instead.")
            
        # Unlink compartments
        session.execute(text("UPDATE storage_compartments SET item_id = NULL, quantity = 0, status = 'empty', updated_at = NOW() WHERE item_id = :iid"), {"iid": item_id})
        
        # Delete item
        session.execute(text("DELETE FROM storage_items WHERE item_id = :iid"), {"iid": item_id})
        session.commit()
        
    return {"message": f"Item #{item_id} deleted successfully."}


@router.post("/items/{item_id}/compartment")
def admin_allocate_compartment(item_id: int, body: CompartmentAllocationRequest, admin_user: dict = Depends(get_current_admin_user)):
    """Allocate or adjust ASRS compartment stock for an item."""
    with db_session() as session:
        item = session.execute(text("SELECT item_id, name FROM storage_items WHERE item_id = :iid"), {"iid": item_id}).fetchone()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
            
        box = body.box_id.strip().upper()
        sub = (body.sub_slot or "a").lower()
        
        # Check if box exists
        box_row = session.execute(text("SELECT box_id FROM storage_boxes WHERE box_id = :box"), {"box": box}).fetchone()
        if not box_row:
            raise HTTPException(status_code=404, detail=f"ASRS Box '{box}' not found (valid range: A1 to E7).")
            
        status = "occupied" if body.quantity > 0 else "empty"
        if body.status:
            status = body.status
            
        session.execute(text("""
            UPDATE storage_compartments
            SET item_id = :iid, quantity = :qty, status = :st, updated_at = NOW()
            WHERE box_id = :box AND sub_slot = :sub
        """), {
            "iid": item_id if body.quantity > 0 else None,
            "qty": body.quantity,
            "st": status,
            "box": box,
            "sub": sub
        })
        session.commit()
        
    return {"message": f"Compartment {box}{sub} updated for item #{item_id} (Qty: {body.quantity})."}


