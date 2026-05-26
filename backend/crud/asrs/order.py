"""
backend/crud/asrs/order.py
==========================
Refactored for Integrated Schema v2 (PostgreSQL lowercase tables).
Maps calculated total_amount dynamically from order_items in SELECTs.
Leverages PostgreSQL database-generated total_price column for order_items.
"""
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional
from datetime import datetime


class OrderController:
    """Controller for Order operations"""

    VALID_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"]

    @staticmethod
    def create_order(order_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new order with items.

        Required keys: customer_name, customer_email, customer_phone,
                       shipping_address, items (list of {item_id, quantity, price})
        Optional keys: total_amount, order_status
        """
        session = InventorySessionLocal()
        try:
            # Validate required fields
            for field in ["customer_name", "customer_email", "customer_phone", "shipping_address"]:
                if not order_data.get(field):
                    raise ValueError(f"Missing required field: {field}")

            items = order_data.get("items", [])
            if not items:
                raise ValueError("Please provide order items")
            for item in items:
                if not item.get("item_id") or not item.get("quantity") or not item.get("price"):
                    raise ValueError("Each item must have item_id, quantity, and price")
                if item["quantity"] <= 0 or item["price"] <= 0:
                    raise ValueError("Quantity and price must be positive")

            # Insert order — total_amount is calculated dynamically from order_items, so not stored on orders table
            result = session.execute(
                text("""
                    INSERT INTO orders
                        (customer_name, customer_email, customer_phone,
                         shipping_address, order_status, machine_id)
                    VALUES
                        (:customer_name, :customer_email, :customer_phone,
                         :shipping_address, :order_status, 'asrs')
                    RETURNING order_id
                """),
                {
                    "customer_name":    order_data["customer_name"],
                    "customer_email":   order_data["customer_email"],
                    "customer_phone":   order_data["customer_phone"],
                    "shipping_address": order_data["shipping_address"],
                    "order_status":     order_data.get("order_status", "pending"),
                }
            )
            order_id = result.fetchone()[0]
            session.flush()

            for item in items:
                # Check inventory
                avail = session.execute(
                    text("""
                        SELECT COUNT(*) FROM storage_compartments
                        WHERE item_id = :item_id AND status = 'occupied'
                    """),
                    {"item_id": int(item["item_id"])}
                ).scalar()
                if avail < item["quantity"]:
                    raise ValueError(
                        f"Insufficient inventory for item {item['item_id']}. "
                        f"Available: {avail}, Requested: {item['quantity']}"
                    )

                # Insert order item (total_price is generated stored column in DB, do not insert it)
                session.execute(
                    text("""
                        INSERT INTO order_items (order_id, item_id, quantity, unit_price)
                        VALUES (:order_id, :item_id, :quantity, :unit_price)
                    """),
                    {
                        "order_id":    order_id,
                        "item_id":     int(item["item_id"]),
                        "quantity":    item["quantity"],
                        "unit_price":  item["price"],
                    }
                )

                # Mark subcompartments empty and log transactions
                compartments = session.execute(
                    text("""
                        SELECT sc.compartment_id AS subcom_place
                        FROM storage_compartments sc
                        JOIN storage_boxes b ON sc.box_id = b.box_id
                        WHERE sc.item_id = :item_id AND sc.status = 'occupied'
                        ORDER BY b.row_label, b.col_number, sc.sub_slot
                        LIMIT :quantity
                    """),
                    {"item_id": int(item["item_id"]), "quantity": item["quantity"]}
                ).fetchall()

                for (subcom_place,) in compartments:
                    session.execute(
                        text("""
                            UPDATE storage_compartments
                            SET status = 'empty', item_id = NULL
                            WHERE compartment_id = :place
                        """),
                        {"place": subcom_place}
                    )
                    session.execute(
                        text("""
                            INSERT INTO storage_transactions (item_id, compartment_id, action, time)
                            VALUES (:item_id, :subcom_place, 'retrieve', :time)
                        """),
                        {"item_id": int(item["item_id"]), "subcom_place": subcom_place, "time": datetime.now()}
                    )

            session.commit()

            # Return the created order
            res2 = session.execute(
                text("""
                    SELECT o.order_id, o.customer_name, o.customer_email, o.customer_phone,
                           o.shipping_address, o.order_status, o.created_at, o.updated_at,
                           COALESCE((SELECT SUM(oi2.quantity * oi2.unit_price) FROM order_items oi2 WHERE oi2.order_id = o.order_id), 0.0) AS total_amount
                    FROM orders o
                    WHERE o.order_id = :id
                """),
                {"id": order_id}
            )
            row2 = res2.fetchone()
            cols2 = res2.keys()
            return dict(zip(cols2, row2)) if row2 else {"order_id": order_id}

        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating order: {e}")
        finally:
            session.close()

    @staticmethod
    def get_all_orders(limit: int = 100) -> List[Dict[str, Any]]:
        """Get all orders with a summary of items and dynamic total_amount"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    SELECT o.order_id, o.customer_name, o.customer_email, o.customer_phone,
                           o.shipping_address, o.order_status, o.created_at, o.updated_at,
                           COALESCE(SUM(oi.quantity * oi.unit_price), 0.0) AS total_amount,
                           STRING_AGG(CAST(oi.quantity AS TEXT) || 'x ' || i.name, ', ') AS items_summary
                    FROM orders o
                    LEFT JOIN order_items oi ON o.order_id = oi.order_id
                    LEFT JOIN storage_items i ON oi.item_id = i.item_id
                    GROUP BY o.order_id, o.customer_name, o.customer_email, o.customer_phone,
                             o.shipping_address, o.order_status, o.created_at, o.updated_at
                    ORDER BY o.created_at DESC
                    LIMIT :limit
                """),
                {"limit": limit}
            )
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching orders: {e}")
        finally:
            session.close()

    @staticmethod
    def get_order_by_id(order_id) -> Optional[Dict[str, Any]]:
        """Get order by ID with detailed items list"""
        session = InventorySessionLocal()
        try:
            order_res = session.execute(
                text("""
                    SELECT o.order_id, o.customer_name, o.customer_email, o.customer_phone,
                           o.shipping_address, o.order_status, o.created_at, o.updated_at,
                           COALESCE((SELECT SUM(oi2.quantity * oi2.unit_price) FROM order_items oi2 WHERE oi2.order_id = o.order_id), 0.0) AS total_amount
                    FROM orders o
                    WHERE o.order_id = :id
                """),
                {"id": int(order_id)}
            )
            order_row = order_res.fetchone()
            if not order_row:
                return None
            order_dict = dict(zip(order_res.keys(), order_row))

            items_res = session.execute(
                text("""
                    SELECT oi.order_item_id, oi.order_id, oi.item_id, oi.quantity, oi.unit_price,
                           oi.total_price, oi.created_at, i.name AS item_name, i.description AS item_description
                    FROM order_items oi
                    JOIN storage_items i ON oi.item_id = i.item_id
                    WHERE oi.order_id = :order_id
                """),
                {"order_id": int(order_id)}
            )
            order_dict["items"] = [dict(zip(items_res.keys(), r)) for r in items_res.fetchall()]
            return order_dict
        except Exception as e:
            raise Exception(f"Error fetching order by ID: {e}")
        finally:
            session.close()

    @staticmethod
    def update_order_status(order_id, status: str) -> Dict[str, Any]:
        """Update order status"""
        if status not in OrderController.VALID_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(OrderController.VALID_STATUSES)}")
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    UPDATE orders
                    SET order_status = :status, updated_at = :updated_at
                    WHERE order_id = :order_id
                """),
                {"status": status, "updated_at": datetime.now(), "order_id": int(order_id)}
            )
            session.commit()
            if result.rowcount == 0:
                raise Exception(f"Order {order_id} not found")
            return {"affectedRows": result.rowcount}
        except Exception as e:
            session.rollback()
            raise Exception(f"Error updating order status: {e}")
        finally:
            session.close()

    @staticmethod
    def get_orders_by_status(status: str) -> List[Dict[str, Any]]:
        """Get orders filtered by status"""
        if status not in OrderController.VALID_STATUSES:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(OrderController.VALID_STATUSES)}")
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    SELECT o.order_id, o.customer_name, o.customer_email, o.customer_phone,
                           o.shipping_address, o.order_status, o.created_at, o.updated_at,
                           COALESCE(SUM(oi.quantity * oi.unit_price), 0.0) AS total_amount,
                           STRING_AGG(CAST(oi.quantity AS TEXT) || 'x ' || i.name, ', ') AS items_summary
                    FROM orders o
                    LEFT JOIN order_items oi ON o.order_id = oi.order_id
                    LEFT JOIN storage_items i ON oi.item_id = i.item_id
                    WHERE o.order_status = :status
                    GROUP BY o.order_id, o.customer_name, o.customer_email, o.customer_phone,
                             o.shipping_address, o.order_status, o.created_at, o.updated_at
                    ORDER BY o.created_at DESC
                """),
                {"status": status}
            )
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching orders by status: {e}")
        finally:
            session.close()

    @staticmethod
    def get_order_stats() -> Dict[str, Any]:
        """Get order statistics summary"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("""
                SELECT
                    COUNT(*)                                                   AS total_orders,
                    COALESCE(SUM((SELECT SUM(oi.quantity * oi.unit_price) FROM order_items oi WHERE oi.order_id = o.order_id)), 0) AS total_revenue,
                    COALESCE(AVG((SELECT SUM(oi.quantity * oi.unit_price) FROM order_items oi WHERE oi.order_id = o.order_id)), 0) AS average_order_value,
                    COUNT(*) FILTER (WHERE order_status = 'pending')          AS pending_orders,
                    COUNT(*) FILTER (WHERE order_status = 'processing')       AS processing_orders,
                    COUNT(*) FILTER (WHERE order_status = 'shipped')          AS shipped_orders,
                    COUNT(*) FILTER (WHERE order_status = 'delivered')        AS delivered_orders,
                    COUNT(*) FILTER (WHERE order_status = 'cancelled')        AS cancelled_orders
                FROM orders o
            """))
            row = result.fetchone()
            return dict(zip(result.keys(), row))
        except Exception as e:
            raise Exception(f"Error fetching order statistics: {e}")
        finally:
            session.close()

