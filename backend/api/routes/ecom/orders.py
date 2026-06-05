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
from typing import List

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
    item_id: int
    quantity: int


class PlaceOrderRequest(BaseModel):
    shipping_address: str
    items: List[CartItem]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _enqueue_retrieval(session, item_id: int, qty: int, ecom_user_id: str) -> int:
    """Insert a retrieval_queue entry and return queue_id."""
    row = session.execute(text("""
        INSERT INTO retrieval_queue
            (machine_id, item_id, enqueue_at, status, priority, notes)
        VALUES ('asrs', :iid, :now, 'pending', 3, :note)
        RETURNING queue_id
    """), {
        "iid": item_id,
        "now": ist_now(),
        "note": f"ecom order from user {ecom_user_id} — qty {qty}"
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


async def _broadcast_order_event(order_id: int, item_id: int, status: str,
                                  compartments: list, plc_ok: bool):
    """Push a typed event to all ASRS WebSocket clients."""
    try:
        from backend.websockets.asrs_broadcaster import led_ws_manager
        import orjson
        msg = orjson.dumps({
            "type": "ecom_order",
            "payload": {
                "order_id": order_id,
                "item_id": item_id,
                "status": status,
                "plc_ok": plc_ok,
                "compartments_cleared": compartments,
            }
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

    # ── Step 1: Validate all items have sufficient stock ──────────────────────
    session = InventorySessionLocal()
    try:
        for ci in body.items:
            rows = session.execute(text("""
                SELECT quantity
                FROM storage_compartments
                WHERE item_id = :iid AND status = 'occupied'
                FOR UPDATE
            """), {"iid": ci.item_id}).fetchall()
            avail = sum(row[0] for row in rows)

            if avail < ci.quantity:
                raise HTTPException(status_code=400,
                    detail=f"Insufficient stock for item {ci.item_id}. "
                           f"Available: {avail}, Requested: {ci.quantity}")

        # ── Step 2: Fetch prices from storage_items ───────────────────────────
        prices = {}
        for ci in body.items:
            row = session.execute(text("""
                SELECT price, name FROM storage_items
                WHERE item_id = :iid AND item_type = 'finished'
            """), {"iid": ci.item_id}).fetchone()
            if not row:
                raise HTTPException(status_code=404,
                    detail=f"Product {ci.item_id} not found or not a finished product")
            prices[ci.item_id] = {"price": float(row[0]), "name": row[1]}

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
        queue_map = {}   # item_id → queue_id
        for ci in body.items:
            price = prices[ci.item_id]["price"]
            session.execute(text("""
                INSERT INTO order_items (order_id, item_id, quantity, unit_price)
                VALUES (:oid, :iid, :qty, :price)
            """), {"oid": order_id, "iid": ci.item_id,
                   "qty": ci.quantity, "price": price})

            queue_id = _enqueue_retrieval(session, ci.item_id, ci.quantity, ecom_user_id)
            queue_map[ci.item_id] = queue_id

        session.commit()
        logger.info(f"[ECOM] Order #{order_id} created, queue_ids={queue_map}")

    except HTTPException:
        session.rollback()
        raise
    except Exception as e:
        session.rollback()
        logger.error(f"[ECOM] Order creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()

    # ── Step 6: Trigger ASRS PLC retrieval in the background ─────────────────
    background_tasks.add_task(
        _process_retrievals_background,
        body.items,
        queue_map,
        plc_connected,
        order_id
    )

    return {
        "order_id": order_id,
        "status": "pending" if plc_connected else "pending",
        "plc_connected": plc_connected,
        "retrieval": [],  # Retrieved asynchronously
        "message": (
            "Order placed and ASRS retrieval queued in background."
            if plc_connected else
            "Order placed. ASRS is offline — stock reserved for physical pickup."
        )
    }


def _process_retrievals_background(items, queue_map, plc_connected, order_id):
    """
    Background worker that runs the physical ASRS retrieval sequentially.
    """
    logger.info(f"[ECOM BACKGROUND] Starting sequential retrieval for order #{order_id}")
    retrieval_results = []
    all_ok = True

    for ci in items:
        queue_id = queue_map[ci.item_id]
        compartments_cleared = []
        plc_ok = False
        plc_commands = []

        s2 = InventorySessionLocal()
        try:
            _mark_queue_processing(s2, queue_id)
            s2.commit()

            if plc_connected:
                # ── Actually run the ASRS PLC (this blocks and waits sequentially)
                result = asrs_logic.retrieve_product_with_asrs(
                    str(ci.item_id), ci.quantity
                )
                plc_ok = result.get("success", False)
                plc_commands = result.get("plc_commands_sent", [])
                locations = result.get("locations", [])

                if plc_ok:
                    # Log each cleared compartment into storage_transactions
                    for loc in locations:
                        comp_id = loc["subcom_place"]
                        cmd_str = loc.get("box_id", "?")
                        _log_transaction(s2, ci.item_id, comp_id,
                                         queue_id, cmd_str, "ecom_ok")
                        compartments_cleared.append(comp_id)
                    _mark_queue_completed(s2, queue_id)
                    s2.commit()
                else:
                    # PLC failed — keep queue as processing
                    logger.warning(f"[ECOM BACKGROUND] PLC retrieval failed for item {ci.item_id}")
                    all_ok = False

            else:
                # PLC offline — do DB-only retrieval (dequeue when PLC reconnects)
                compartments = s2.execute(text("""
                    SELECT sc.compartment_id, sc.box_id
                    FROM storage_compartments sc
                    JOIN storage_boxes b ON sc.box_id = b.box_id
                    WHERE sc.item_id = :iid AND sc.status = 'occupied'
                    ORDER BY b.row_label DESC, b.col_number DESC, sc.sub_slot DESC
                    LIMIT :qty
                    FOR UPDATE SKIP LOCKED
                """), {"iid": ci.item_id, "qty": ci.quantity}).fetchall()

                for (comp_id, box_id) in compartments:
                    s2.execute(text("""
                        UPDATE storage_compartments
                        SET status='empty', item_id=NULL WHERE compartment_id=:comp
                    """), {"comp": comp_id})
                    _log_transaction(s2, ci.item_id, comp_id,
                                     queue_id, box_id, "ecom_db_only_plc_offline")
                    compartments_cleared.append(comp_id)

                _mark_queue_completed(s2, queue_id)
                s2.commit()
                plc_ok = True  # DB side succeeded

        except Exception as e:
            s2.rollback()
            logger.error(f"[ECOM BACKGROUND] Retrieval error for item {ci.item_id}: {e}")
            all_ok = False
        finally:
            s2.close()

        retrieval_results.append({
            "item_id": ci.item_id,
            "plc_ok": plc_ok,
            "compartments_cleared": compartments_cleared,
        })

        # Broadcast to ASRS HMI WebSocket clients
        try:
            # We are in a background thread, so create a new event loop
            # and run the broadcast coroutine until complete
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            new_loop.run_until_complete(
                _broadcast_order_event(
                    order_id, ci.item_id,
                    "processing" if plc_ok else "pending",
                    compartments_cleared, plc_ok
                )
            )
            new_loop.close()
        except Exception as e:
            logger.warning(f"[ECOM BACKGROUND] Broadcast task error: {e}")

    # ── Step 7: Update overall order status ──────────────────────────────────
    final_status = "processing" if all_ok else "pending"
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
    """Return the last 10 ecom orders for the ASRS dashboard (unauthenticated)."""
    with db_session() as session:
        rows = session.execute(text("""
            SELECT o.order_id, o.order_status, o.created_at,
                   (SELECT item_id FROM order_items WHERE order_id = o.order_id ORDER BY order_item_id ASC LIMIT 1) as item_id
            FROM orders o
            WHERE o.ecom_user_id IS NOT NULL AND o.order_status != 'cancelled'
            ORDER BY o.created_at DESC
            LIMIT 10
        """)).fetchall()

        results = []
        for r in rows:
            order_id, status, created_at, item_id = r
            
            comps = []
            if item_id:
                comps_rows = session.execute(text("""
                    SELECT st.compartment_id
                    FROM storage_transactions st
                    JOIN retrieval_queue rq ON st.queue_id = rq.queue_id
                    WHERE st.item_id = :iid
                      AND rq.notes LIKE '%ecom order%'
                      AND EXISTS (
                          SELECT 1 FROM order_items oi2 
                          WHERE oi2.order_id = :oid AND oi2.item_id = st.item_id
                      )
                """), {"iid": item_id, "oid": order_id}).fetchall()
                comps = [c[0] for c in comps_rows]
                
            results.append({
                "order_id": order_id,
                "item_id": item_id,
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
