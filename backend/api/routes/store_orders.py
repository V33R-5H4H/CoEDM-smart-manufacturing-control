"""
backend/api/routes/store_orders.py
===================================
Storefront Order Fulfillment Orchestrator.

Handles:
1. POST /api/store/order:
   - Registers customer order in PostgreSQL
   - Enqueues ASRS retrieval
   - Spawns background task:
     a) Phase 1: ASRS Retrieval (PLC or simulated movement to bin and handoff)
     b) Phase 2: Completion of retrieval & drop-off confirmation
     c) Phase 3: Automatic dispatch of AMR from ASRS to Assembly
2. GET /api/store/order-status/{order_id}:
   - Live query for current fulfillment stage
"""

import asyncio
import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import text

from backend.database.inventory_db import InventorySessionLocal
from backend.core.timezone import ist_now
from backend.stations.asrs.asrs_singleton import asrs_controller
from backend.websockets.asrs_broadcaster import led_ws_manager
from backend.stations.amr.amr_controller import dispatch_amr_to_station
from backend.stations.amr.amr_station import amr_station
from backend.websockets.amr_broadcaster import amr_ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/store", tags=["Store Fulfillment"])

# In-memory tracking cache for active order transitions
ACTIVE_STORE_ORDERS: Dict[int, Dict[str, Any]] = {}


class StoreOrderRequest(BaseModel):
    item_id: Optional[int] = None
    item_name: str
    quantity: int = 1
    item_type: Optional[str] = "housing"
    customer_name: Optional[str] = "Store Customer"
    shipping_address: Optional[str] = "CoEDM Automated Manufacturing Bay"


@router.post("/order")
async def create_store_order(body: StoreOrderRequest, background_tasks: BackgroundTasks):
    """
    Place an order from the Storefront.
    Creates DB records and begins the ASRS -> AMR fulfillment pipeline in the background.
    """
    session = InventorySessionLocal()
    try:
        # 1. Look up or assign item_id
        assigned_item_id = body.item_id
        if not assigned_item_id:
            row = session.execute(
                text("SELECT item_id FROM storage_items WHERE name ILIKE :name LIMIT 1"),
                {"name": f"%{body.item_name}%"}
            ).fetchone()
            if row:
                assigned_item_id = row[0]
            else:
                # Fallback to standard item #1
                first_item = session.execute(text("SELECT item_id FROM storage_items LIMIT 1")).fetchone()
                assigned_item_id = first_item[0] if first_item else 1

        # 2. Find an occupied or sample compartment to fetch from
        comp_row = session.execute(
            text("""
                SELECT compartment_id, box_id, sub_slot 
                FROM storage_compartments 
                WHERE item_id = :iid AND status = 'occupied'
                LIMIT 1
            """),
            {"iid": assigned_item_id}
        ).fetchone()

        if comp_row:
            comp_id = comp_row[0]
            box_id = comp_row[1]
        else:
            # Fallback compartment (e.g. B3)
            box_id = "B3"
            comp_id = "B3a"

        # 3. Insert into orders table
        order_res = session.execute(
            text("""
                INSERT INTO orders 
                    (machine_id, customer_name, customer_email, shipping_address, order_status, created_at, updated_at)
                VALUES 
                    ('asrs', :cname, :email, :addr, 'processing', :now, :now)
                RETURNING order_id
            """),
            {
                "cname": body.customer_name or "Store Customer",
                "email": "customer@coedm.lab",
                "addr": body.shipping_address or "Bay 1 Delivery Point",
                "now": ist_now()
            }
        )
        order_id = order_res.fetchone()[0]

        # 4. Insert order_items
        session.execute(
            text("""
                INSERT INTO order_items (order_id, item_id, quantity, unit_price)
                VALUES (:oid, :iid, :qty, 150.00)
            """),
            {
                "oid": order_id,
                "iid": assigned_item_id,
                "qty": body.quantity
            }
        )

        # 5. Insert retrieval_queue
        session.execute(
            text("""
                INSERT INTO retrieval_queue 
                    (machine_id, item_id, enqueue_at, status, priority, notes)
                VALUES 
                    ('asrs', :iid, :now, 'processing', 3, :notes)
            """),
            {
                "iid": assigned_item_id,
                "now": ist_now(),
                "notes": f"Store order #{order_id} | compartment: {comp_id} | item: {body.item_name}"
            }
        )

        session.commit()

        # Initialize tracking status
        ACTIVE_STORE_ORDERS[order_id] = {
            "order_id": order_id,
            "item_name": body.item_name,
            "comp_id": comp_id,
            "box_id": box_id,
            "phase": "asrs_fetching",
            "asrs_completed": False,
            "amr_moving": False,
            "status": "processing",
            "message": f"AS/RS Shuttle dispatched to retrieve {body.item_name} from rack {box_id}..."
        }

        # Launch background fulfillment pipeline
        background_tasks.add_task(_execute_fulfillment_pipeline, order_id, box_id, comp_id, body.item_name)

        return {
            "success": True,
            "order_id": order_id,
            "item_name": body.item_name,
            "compartment": comp_id,
            "box_id": box_id,
            "phase": "asrs_fetching",
            "message": "Order created. AS/RS retrieval initiated."
        }

    except Exception as e:
        session.rollback()
        logger.error(f"[STORE ORDER] Failed to create order: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.get("/order-status/{order_id}")
async def get_order_fulfillment_status(order_id: int):
    """Query live status of an order's fulfillment progress."""
    if order_id in ACTIVE_STORE_ORDERS:
        return ACTIVE_STORE_ORDERS[order_id]

    # Fallback to DB
    session = InventorySessionLocal()
    try:
        row = session.execute(
            text("SELECT order_status, created_at FROM orders WHERE order_id = :oid"),
            {"oid": order_id}
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Order not found")
        
        status = row[0]
        asrs_done = status in ["fetched", "in_transit", "shipped", "delivered"]
        amr_moving = status in ["in_transit"]

        return {
            "order_id": order_id,
            "status": status,
            "phase": "amr_moving" if amr_moving else ("asrs_completed" if asrs_done else "asrs_fetching"),
            "asrs_completed": asrs_done,
            "amr_moving": amr_moving,
            "message": f"Order status: {status}"
        }
    finally:
        session.close()


async def _execute_fulfillment_pipeline(order_id: int, box_id: str, comp_id: str, item_name: str):
    """
    Background worker that orchestrates:
    1. ASRS shuttle retrieval (moving to bin, loading, moving to drop-off)
    2. Handoff confirmation
    3. AMR automated dispatch and movement
    """
    logger.info(f"[STORE PIPELINE] Starting fulfillment for Order #{order_id} ({item_name})")

    # ── PHASE 1: ASRS Shuttle Retrieval ──────────────────────────────────────
    col = box_id[0].upper()
    try:
        row_num = int(box_id[1])
    except (ValueError, IndexError):
        row_num = 3

    ACTIVE_STORE_ORDERS[order_id]["phase"] = "asrs_fetching"
    ACTIVE_STORE_ORDERS[order_id]["message"] = f"Shuttle moving to bin {box_id}..."

    # Notify ASRS WebSocket clients
    await _broadcast_asrs_order(order_id, item_name, "processing", comp_id)

    plc_connected = asrs_controller.is_connected()
    if plc_connected:
        try:
            logger.info(f"[STORE PIPELINE] Issuing PLC retrieve command for {box_id}")
            asrs_controller.run(box_id)
            # Wait for shuttle to complete movement
            timeout = 45
            t0 = asyncio.get_event_loop().time()
            await asyncio.sleep(2)
            while (asyncio.get_event_loop().time() - t0) < timeout:
                state_snap = asrs_controller.get_shuttle_state()
                if state_snap.get("state") in ("idle", "error"):
                    break
                await asyncio.sleep(1.5)
        except Exception as e:
            logger.warning(f"[STORE PIPELINE] Physical PLC retrieval error: {e}")
    else:
        # Animated demonstration mode: simulate shuttle gliding to shelf, then to drop-off
        logger.info(f"[STORE PIPELINE] Running simulated shuttle retrieval for bin {box_id}")
        
        # Step 1a: Moving from home to shelf
        asrs_controller.shuttle.set_moving(col, row_num, f"RETRIEVE_{box_id}")
        await led_ws_manager.broadcast_shuttle_state(row_num, col, "moving", f"RETRIEVE_{box_id}")
        await asyncio.sleep(2.5)

        # Step 1b: Reached shelf (busy picking)
        await led_ws_manager.broadcast_shuttle_state(row_num, col, "busy", f"PICKING_{comp_id}")
        ACTIVE_STORE_ORDERS[order_id]["message"] = f"Retrieving crate from {box_id}..."
        await asyncio.sleep(2.0)

        # Step 1c: Transporting crate down to Drop-off station (Col A, Row 7)
        asrs_controller.shuttle.set_moving("A", 7, "DROPOFF")
        await led_ws_manager.broadcast_shuttle_state(7, "A", "moving", "TO_DROPOFF")
        ACTIVE_STORE_ORDERS[order_id]["message"] = "Transporting part to drop-off conveyor..."
        await asyncio.sleep(2.5)

        # Step 1d: Shuttle arrived at drop-off station and idle
        asrs_controller.shuttle.state = "idle"
        await led_ws_manager.broadcast_shuttle_state(7, "A", "idle", "READY")

    # ── PHASE 2: ASRS Retrieval Complete ─────────────────────────────────────
    logger.info(f"[STORE PIPELINE] ASRS retrieval complete for Order #{order_id}")
    ACTIVE_STORE_ORDERS[order_id]["asrs_completed"] = True
    ACTIVE_STORE_ORDERS[order_id]["phase"] = "asrs_completed"
    ACTIVE_STORE_ORDERS[order_id]["message"] = f"✅ Retrieval complete! {item_name} ready at drop-off conveyor."

    # Update DB order status
    s2 = InventorySessionLocal()
    try:
        s2.execute(
            text("UPDATE orders SET order_status = 'processing', updated_at = :now WHERE order_id = :oid"),
            {"now": ist_now(), "oid": order_id}
        )
        s2.execute(
            text("UPDATE storage_compartments SET status = 'empty', updated_at = :now WHERE compartment_id = :cid"),
            {"now": ist_now(), "cid": comp_id}
        )
        s2.commit()
    except Exception as e:
        logger.error(f"[STORE PIPELINE] DB update error: {e}")
        s2.rollback()
    finally:
        s2.close()

    await _broadcast_asrs_order(order_id, item_name, "shipped", comp_id)

    # Pause 1.5 seconds so user visibly sees the completed state before AMR transition
    await asyncio.sleep(1.5)

    # ── PHASE 3: AMR Automated Dispatch & Movement ────────────────────────────
    logger.info(f"[STORE PIPELINE] Auto-dispatching AMR for Order #{order_id}")
    ACTIVE_STORE_ORDERS[order_id]["phase"] = "amr_moving"
    ACTIVE_STORE_ORDERS[order_id]["amr_moving"] = True
    ACTIVE_STORE_ORDERS[order_id]["message"] = f"AMR Dispatched! Transporting {item_name} to Assembly..."

    amr_connected = amr_station.client.is_connected
    if amr_connected:
        try:
            # Dispatch AMR to ASRS or ASSEMBLY
            await dispatch_amr_to_station("ASRS")
        except Exception as e:
            logger.warning(f"[STORE PIPELINE] AMR dispatch error: {e}")
    else:
        # Simulate smooth AMR navigation trajectory across the factory floor
        logger.info(f"[STORE PIPELINE] Simulating AMR motion from ASRS to Assembly")
        amr_station.state["status"] = "navigating"
        amr_station.state["last_message"] = f"Navigating: Order #{order_id} transport"

        # Coordinates: ASRS is around (-4.0, 0.2), Assembly is at (5.63, 1.21)
        start_x, start_y = -4.0, 0.2
        target_x, target_y = 5.63, 1.21
        steps = 15

        for i in range(steps + 1):
            t = i / steps
            cur_x = start_x + (target_x - start_x) * t
            cur_y = start_y + (target_y - start_y) * t
            amr_station.state["position"] = {"x": round(cur_x, 3), "y": round(cur_y, 3)}
            await amr_ws_manager.broadcast_state(amr_station.get_state())
            await asyncio.sleep(0.8)

        amr_station.state["status"] = "idle"
        amr_station.state["last_message"] = "Arrived at ASSEMBLY station"
        await amr_ws_manager.broadcast_state(amr_station.get_state())

    # Finalize Order
    ACTIVE_STORE_ORDERS[order_id]["phase"] = "completed"
    ACTIVE_STORE_ORDERS[order_id]["status"] = "in_transit"
    ACTIVE_STORE_ORDERS[order_id]["message"] = f"Transport complete for Order #{order_id}."

    s3 = InventorySessionLocal()
    try:
        s3.execute(
            text("UPDATE orders SET order_status = 'shipped', updated_at = :now WHERE order_id = :oid"),
            {"now": ist_now(), "oid": order_id}
        )
        s3.commit()
    except Exception:
        s3.rollback()
    finally:
        s3.close()


async def _broadcast_asrs_order(order_id: int, item_name: str, status: str, comp_id: str):
    """Broadcast order event over ASRS LED/Order WebSocket."""
    try:
        import orjson
        msg = orjson.dumps({
            "type": "ecom_order",
            "payload": {
                "order_id": order_id,
                "item_name": item_name,
                "status": status,
                "sub_id": order_id,
                "plc_ok": True,
                "compartments_cleared": [comp_id]
            }
        }).decode("utf-8")
        await led_ws_manager._send_to_all(msg)
    except Exception as e:
        logger.warning(f"[STORE BROADCAST] Error: {e}")
