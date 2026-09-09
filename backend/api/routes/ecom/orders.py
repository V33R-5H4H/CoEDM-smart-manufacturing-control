"""
backend/api/routes/ecom/orders.py
====================================
E-commerce order placement and tracking.

On POST /api/ecom/orders:
  1. Validate stock for each item
  2. Create order + order_items rows (linked to ecom_user)
  3. Create retrieval_queue entries (priority=3, high)
  4. Call asrs_logic.retrieve_product_with_asrs() for each item
     → This triggers the PHYSICAL ASRS PLC (same as manual retrieval)
     → Shuttle animation fires on the HMI page automatically
  5. Log storage_transactions (retrieve) for every compartment cleared
  6. Broadcast ecom_order event via ASRS WebSocket
  7. Update order status → 'processing' (or 'pending' if PLC offline)
"""
import logging
import asyncio
from datetime import datetime
from typing import List, Optional, Union

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import text

from backend.database.db import db_session
from backend.database.inventory_db import InventorySessionLocal
from backend.core.timezone import ist_now
from backend.api.routes.ecom.auth import get_current_ecom_user
from backend.stations.asrs.asrs_logic import ASRSLogic
from backend.stations.asrs.asrs_singleton import asrs_controller

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orders")

asrs_logic = ASRSLogic()


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class CartItem(BaseModel):
    item_id: Union[int, str]
    quantity: int


class PlaceOrderRequest(BaseModel):
    shipping_address: str
    items: List[CartItem]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _enqueue_retrieval(session, item_id: int, ecom_user_id: str, order_id: int, comp_id: str = None) -> int:
    """Insert a retrieval_queue entry and return queue_id."""
    note = f"Automated ecom order #{order_id}"
    if comp_id:
        note += f" | compartment: {comp_id}"
        
    row = session.execute(text("""
        INSERT INTO retrieval_queue
            (machine_id, item_id, enqueue_at, status, priority, notes)
        VALUES ('asrs', :iid, :now, 'pending', 3, :note)
        RETURNING queue_id
    """), {
        "iid": item_id,
        "now": ist_now(),
        "note": note
    }).fetchone()
    return row[0]


def _mark_queue_processing(session, queue_id: int):
    session.execute(text("""
        UPDATE retrieval_queue SET status='processing' WHERE queue_id=:qid
    """), {"qid": queue_id})


def _mark_queue_completed(session, queue_id: int):
    session.execute(text("""
        UPDATE retrieval_queue SET status='completed', processed_at=:now WHERE queue_id=:qid
    """), {"qid": queue_id, "now": ist_now()})


def _log_transaction(session, item_id: int, compartment_id: str,
                     queue_id: int, plc_command: str, plc_result: str):
    """Write a retrieve row into storage_transactions."""
    session.execute(text("""
        INSERT INTO storage_transactions
            (machine_id, time, compartment_id, item_id, action, quantity,
             queue_id, asrs_command, asrs_result, notes)
        VALUES ('asrs', :now, :comp, :iid, 'retrieve', 1,
                :qid, :cmd, :res, 'ecom order retrieval')
    """), {
        "now": ist_now(),
        "comp": compartment_id,
        "iid": item_id,
        "qid": queue_id,
        "cmd": plc_command,
        "res": plc_result,
    })


async def _broadcast_ecom_order(order_id: int, item_id: int, sub_id: str,
                                status: str, plc_ok: bool, compartments: list):
    """Notify WebSocket subscribers of an ecom order event."""
    try:
        from backend.websockets.asrs_broadcaster import led_ws_manager
        import orjson
        payload = {
            "order_id": order_id,
            "item_id": item_id,
            "sub_id": sub_id,
            "status": status,
            "plc_ok": plc_ok,
            "compartments_cleared": compartments,
        }
        msg = orjson.dumps({
            "type": "ecom_order",
            "payload": payload
        }).decode()
        await led_ws_manager._send_to_all(msg)
    except Exception as e:
        logger.warning(f"[ECOM] WebSocket broadcast failed: {e}")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("")
async def place_order(body: PlaceOrderRequest, background_tasks: BackgroundTasks, user=Depends(get_current_ecom_user)):
    """
    Place an order. Triggers ASRS retrieval for each item immediately.
    If the ASRS PLC is connected, the physical shuttle will move.
    If not connected, order is queued as 'pending' for manual dispatch.
    """
    ecom_user_id = user["user_id"]
    plc_connected = asrs_controller.is_connected()

    # ── Normalize item IDs (handles service items like 'SVC-PRESS-ASSY' or string IDs)
    normalized_items = []
    for ci in body.items:
        raw_id = ci.item_id
        if isinstance(raw_id, str):
            if raw_id.upper() in ('SVC-PRESS-ASSY', 'SVC-ASSY-PRESS', 'SERVICE'):
                iid = 201
            else:
                try:
                    iid = int(raw_id)
                except ValueError:
                    iid = 201
        else:
            iid = int(raw_id)
        normalized_items.append({"item_id": iid, "quantity": max(1, ci.quantity)})

    # ── Step 1: Validate physical stock in ASRS (skip services) ─────────────────
    session = InventorySessionLocal()
    try:
        for ci in normalized_items:
            iid = ci["item_id"]
            qty = ci["quantity"]
            if iid == 201:
                continue

            rows = session.execute(text("""
                SELECT quantity
                FROM storage_compartments
                WHERE item_id = :iid AND status = 'occupied'
                FOR UPDATE
            """), {"iid": iid}).fetchall()
            avail = sum(row[0] for row in rows)

            if avail < qty:
                raise HTTPException(status_code=400,
                    detail=f"Insufficient stock for item {iid}. Available: {avail}, Requested: {qty}")

        # ── Step 2: Fetch prices from storage_items ───────────────────────────
        prices = {}
        for ci in normalized_items:
            iid = ci["item_id"]
            row = session.execute(text("""
                SELECT price, name, item_type FROM storage_items
                WHERE item_id = :iid
            """), {"iid": iid}).fetchone()
            if not row:
                raise HTTPException(status_code=404,
                    detail=f"Product {iid} not found in catalog")
            prices[iid] = {"price": float(row[0]), "name": row[1], "item_type": row[2]}

        # ── Step 3: Fetch ecom_user details ───────────────────────────────────
        ecom_row = session.execute(text("""
            SELECT email, full_name FROM ecom_users WHERE user_id = :uid
        """), {"uid": ecom_user_id}).fetchone()
        customer_email, customer_name = ecom_row

        import html
        sanitized_addr = html.escape(body.shipping_address)

        # ── Step 4: Create order ──────────────────────────────────────────────
        order_id = session.execute(text("""
            INSERT INTO orders
                (machine_id, ecom_user_id, customer_name, customer_email,
                 shipping_address, order_status, created_at, updated_at)
            VALUES
                ('asrs', :uid, :name, :email, :addr, 'pending', :now, :now)
            RETURNING order_id
        """), {
            "uid": ecom_user_id, "name": customer_name,
            "email": customer_email, "addr": sanitized_addr,
            "now": ist_now()
        }).fetchone()[0]

        session.flush()

        # ── Step 5: Create order_items + retrieval_queue entries ──────────────
        queue_map = {}   # item_id → list of queue_ids
        for ci in normalized_items:
            iid = ci["item_id"]
            qty = ci["quantity"]
            price = prices[iid]["price"]
            session.execute(text("""
                INSERT INTO order_items (order_id, item_id, quantity, unit_price)
                VALUES (:oid, :iid, :qty, :price)
            """), {"oid": order_id, "iid": iid,
                   "qty": qty, "price": price})

            if iid == 201:
                # Service item — logged in order_items but no physical ASRS bin retrieval
                continue

            # Fetch subcompartments for this physical item
            available_comps = session.execute(text("""
                SELECT compartment_id, quantity
                FROM storage_compartments
                WHERE item_id = :iid AND quantity > 0
                ORDER BY box_id, sub_slot
                FOR UPDATE SKIP LOCKED
            """), {"iid": iid}).fetchall()

            total_avail = sum(c[1] for c in available_comps)
            if total_avail < qty:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for item {iid} during allocation.")

            queue_map[iid] = []
            remaining_to_deduct = qty

            for comp_id, comp_qty in available_comps:
                if remaining_to_deduct <= 0:
                    break
                deduct = min(remaining_to_deduct, comp_qty)
                new_qty = comp_qty - deduct
                new_status = 'occupied' if new_qty > 0 else 'unoccupied'

                session.execute(text("""
                    UPDATE storage_compartments 
                    SET quantity = :nqty, status = :nst, updated_at = :now 
                    WHERE compartment_id = :cid
                """), {"nqty": new_qty, "nst": new_status, "cid": comp_id, "now": ist_now()})

                # Enqueue retrieval for each deducted unit
                for _ in range(deduct):
                    queue_id = _enqueue_retrieval(session, iid, ecom_user_id, order_id, comp_id)
                    queue_map[iid].append(queue_id)
                    
                    background_tasks.add_task(
                        _broadcast_ecom_order,
                        order_id, iid, str(queue_id), "reserved", False, [comp_id]
                    )

                remaining_to_deduct -= deduct

        session.commit()

        # Launch physical ASRS hardware retrieval in background
        background_tasks.add_task(
            _process_retrievals_background,
            normalized_items, queue_map, plc_connected, order_id
        )

        return {
            "order_id": order_id,
            "status": "pending",
            "message": f"Order #{order_id} placed successfully.",
            "plc_connected": plc_connected,
        }

    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"[ECOM] Error placing order: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to place order: {str(e)}")
    finally:
        session.close()


def _process_retrievals_background(items, queue_map, plc_connected, order_id):
    """
    Background worker that runs the physical ASRS retrieval sequentially.
    """
    logger.info(f"[ECOM BACKGROUND] Starting sequential retrieval for order #{order_id}")
    retrieval_results = []
    all_ok = True

    for ci in items:
        iid = ci["item_id"] if isinstance(ci, dict) else ci.item_id
        queue_ids = queue_map.get(iid, [])
        
        for queue_id in queue_ids:
            compartments_cleared = []
            plc_ok = False
            plc_commands = []

            s2 = InventorySessionLocal()
            try:
                _mark_queue_processing(s2, queue_id)
                s2.commit()

                # Extract reserved compartment from notes
                row = s2.execute(text("SELECT notes FROM retrieval_queue WHERE queue_id = :qid"), {"qid": queue_id}).fetchone()
                note = row[0] if row else ""
                comp_id = ""
                if "compartment: " in note:
                    comp_id = note.split("compartment: ")[1].strip()

                if plc_connected and comp_id:
                    box_id = comp_id[:-1]
                    sub_id = comp_id[-1]
                    
                    # ── Actually run the ASRS PLC for 1 item (this blocks and waits sequentially)
                    result = asrs_logic.retrieve_from_specific_location(box_id, sub_id, iid)
                    plc_ok = result.get("success", False)
                    plc_commands = [result.get("plc_command", "")] if plc_ok else []

                    if plc_ok:
                        _log_transaction(s2, iid, comp_id,
                                         queue_id, box_id, "ecom_ok")
                        compartments_cleared.append(comp_id)
                        _mark_queue_completed(s2, queue_id)
                        s2.commit()
                    else:
                        # PLC failed — keep queue as processing
                        logger.warning(f"[ECOM BACKGROUND] PLC retrieval failed for item {iid} sub {queue_id}")
                        all_ok = False

                else:
                    # PLC offline — keep the queue as 'pending' so it can be physically retrieved later
                    s2.execute(text("UPDATE retrieval_queue SET status='pending' WHERE queue_id=:qid"), {"qid": queue_id})
                    s2.commit()
                    plc_ok = False

            except Exception as e:
                s2.rollback()
                logger.error(f"[ECOM BACKGROUND] Retrieval error for item {iid} sub {queue_id}: {e}")
                all_ok = False
            finally:
                s2.close()

            retrieval_results.append({
                "item_id": iid,
                "sub_id": queue_id,
                "plc_ok": plc_ok,
                "compartments_cleared": compartments_cleared,
            })

            # Broadcast to ASRS HMI WebSocket clients
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                new_loop.run_until_complete(
                    _broadcast_ecom_order(
                        order_id, iid, str(queue_id),
                        "shipped" if plc_ok else "pending",
                        plc_ok, compartments_cleared
                    )
                )
                new_loop.close()
            except Exception as e:
                logger.warning(f"[ECOM BACKGROUND] Broadcast task error: {e}")

    # ── Step 7: Update overall order status ──────────────────────────────────
    final_status = "shipped" if all_ok else "pending"
    s3 = InventorySessionLocal()
    try:
        s3.execute(text("""
            UPDATE orders SET order_status=:st, updated_at=:now WHERE order_id=:oid
        """), {"st": final_status, "now": ist_now(), "oid": order_id})
        s3.commit()
    except Exception as e:
        logger.error(f"[ECOM BACKGROUND] Failed to update final order status: {e}")
        s3.rollback()
    finally:
        s3.close()
    
    logger.info(f"[ECOM BACKGROUND] Finished processing order #{order_id}")


@router.get("/recent/feed")
def recent_order_feed():
    """Return the last 20 individual ecom order items for the ASRS dashboard (unauthenticated)."""
    with db_session() as session:
        rows = session.execute(text("""
            SELECT o.order_id, o.order_status, o.created_at, rq.item_id, rq.queue_id, rq.status, rq.notes
            FROM orders o
            JOIN retrieval_queue rq ON rq.notes LIKE 'Automated ecom order #' || CAST(o.order_id AS TEXT) || '%'
            WHERE o.ecom_user_id IS NOT NULL AND o.order_status != 'cancelled'
            ORDER BY rq.queue_id DESC
            LIMIT 20
        """)).fetchall()

        results = []
        for r in rows:
            order_id, order_status, created_at, item_id, queue_id, q_status, notes = r
            
            comps = []
            if notes and "compartment: " in notes:
                comps = [notes.split("compartment: ")[1].strip()]
                
            # If the queue item is completed, mark it shipped, otherwise use queue status
            status = "shipped" if q_status == "completed" else q_status

            results.append({
                "order_id": order_id,
                "item_id": item_id,
                "sub_id": queue_id,
                "status": status,
                "plc_ok": True, # Informational
                "compartments": comps,
                "time": created_at.isoformat() if created_at else None
            })
        return results



@router.get("/{order_id}")
def track_order(order_id: int, user=Depends(get_current_ecom_user)):
    """Track an order by ID. Only the owning customer can view it."""
    with db_session() as session:
        order = session.execute(text("""
            SELECT o.order_id, o.order_status, o.shipping_address,
                   o.created_at, o.updated_at, o.ecom_user_id,
                   COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_amount
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.order_id
            WHERE o.order_id = :oid
            GROUP BY o.order_id, o.order_status, o.shipping_address,
                     o.created_at, o.updated_at, o.ecom_user_id
        """), {"oid": order_id}).fetchone()

        if not order:
            raise HTTPException(status_code=404, detail="Order not found")

        order_dict = dict(zip(
            ["order_id","order_status","shipping_address","created_at",
             "updated_at","ecom_user_id","total_amount"], order
        ))

        # Ownership check
        if str(order_dict["ecom_user_id"]) != user["user_id"]:
            raise HTTPException(status_code=403, detail="Access denied")

        # Fetch items
        items = session.execute(text("""
            SELECT oi.item_id, oi.quantity, oi.unit_price, oi.total_price,
                   si.name, si.sku,
                   rq.status AS queue_status
            FROM order_items oi
            JOIN storage_items si ON si.item_id = oi.item_id
            LEFT JOIN retrieval_queue rq
                ON rq.item_id = oi.item_id
                AND rq.notes LIKE '%ecom order from user ' || :uid || '%'
            WHERE oi.order_id = :oid
            ORDER BY oi.order_item_id
        """), {"oid": order_id, "uid": user["user_id"]}).fetchall()

        item_cols = ["item_id","quantity","unit_price","total_price",
                     "name","sku","queue_status"]
        order_dict["items"] = [dict(zip(item_cols, r)) for r in items]

        # Fetch retrieval transactions
        transactions = session.execute(text("""
            SELECT st.tran_id, st.time, st.compartment_id, st.item_id,
                   st.action, st.asrs_command, st.asrs_result
            FROM storage_transactions st
            JOIN retrieval_queue rq ON rq.queue_id = st.queue_id
            WHERE rq.notes LIKE '%ecom order from user ' || :uid || '%'
              AND EXISTS (
                  SELECT 1 FROM order_items oi
                  WHERE oi.order_id = :oid AND oi.item_id = st.item_id
              )
            ORDER BY st.time
        """), {"oid": order_id, "uid": user["user_id"]}).fetchall()

        tx_cols = ["tran_id","time","compartment_id","item_id",
                   "action","asrs_command","asrs_result"]
        order_dict["transactions"] = [dict(zip(tx_cols, r)) for r in transactions]

        return order_dict


@router.get("")
def my_orders(user=Depends(get_current_ecom_user)):
    """Return all orders belonging to the logged-in customer."""
    with db_session() as session:
        rows = session.execute(text("""
            SELECT o.order_id, o.order_status, o.shipping_address,
                   o.created_at, o.updated_at,
                   COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total_amount,
                   STRING_AGG(si.name || ' x' || oi.quantity::text, ', ') AS items_summary
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.order_id
            LEFT JOIN storage_items si ON si.item_id = oi.item_id
            WHERE o.ecom_user_id = :uid
            GROUP BY o.order_id, o.order_status, o.shipping_address,
                     o.created_at, o.updated_at
            ORDER BY o.created_at DESC
        """), {"uid": user["user_id"]}).fetchall()

        cols = ["order_id","order_status","shipping_address","created_at",
                "updated_at","total_amount","items_summary"]
        return [dict(zip(cols, r)) for r in rows]
