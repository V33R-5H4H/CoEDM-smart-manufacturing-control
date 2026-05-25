"""
backend/crud/asrs/order.py
==========================
Updated to use new schema (Integrated_Schema):
  orders        (order_id SERIAL, machine_id, operator_id, customer_name, customer_email,
                 customer_phone, shipping_address, total_amount, order_status, notes)
  order_items   (order_item_id, order_id, item_id, quantity, unit_price, total_price)
  storage_items (item_id, name, ...)
  storage_compartments (compartment_id, ...)
  storage_transactions (...)
"""
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone


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

            total_amount = order_data.get("total_amount") or sum(
                i["price"] * i["quantity"] for i in items
            )

            # Insert order — use RETURNING to get the generated ID (PostgreSQL)
            result = session.execute(
                text("""
                    INSERT INTO orders
                        (machine_id, customer_name, customer_email, customer_phone,
                         shipping_address, total_amount, order_status)
                    VALUES
                        ('asrs', :customer_name, :customer_email, :customer_phone,
                         :shipping_address, :total_amount, :order_status)
                    RETURNING order_id
                """),
                {
                    "customer_name":    order_data["customer_name"],
                    "customer_email":   order_data["customer_email"],
                    "customer_phone":   order_data["customer_phone"],
                    "shipping_address": order_data["shipping_address"],
                    "total_amount":     total_amount,
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
                    {"item_id": item["item_id"]}
                ).scalar()
                if avail < item["quantity"]:
                    raise ValueError(
                        f"Insufficient inventory for item {item['item_id']}. "
                        f"Available: {avail}, Requested: {item['quantity']}"
                    )

                # Insert order item
                session.execute(
                    text("""
                        INSERT INTO order_items (order_id, item_id, quantity, unit_price, total_price)
                        VALUES (:order_id, :item_id, :quantity, :unit_price, :total_price)
                    """),
                    {
                        "order_id":    order_id,
                        "item_id":     item["item_id"],
                        "quantity":    item["quantity"],
                        "unit_price":  item["price"],
                        "total_price": item["price"] * item["quantity"],
                    }
                )

                # Mark storage_compartments empty and log transactions
                compartments = session.execute(
                    text("""
                        SELECT sc.compartment_id
                        FROM storage_compartments sc
                        JOIN storage_boxes b ON sc.box_id = b.box_id
                        WHERE sc.item_id = :item_id AND sc.status = 'occupied'
                        ORDER BY b.row_label, b.col_number, sc.sub_slot
                        LIMIT :quantity
                    """),
                    {"item_id": item["item_id"], "quantity": item["quantity"]}
                ).fetchall()

                for (compartment_id,) in compartments:
                    session.execute(
                        text("""
                            UPDATE storage_compartments
                            SET status = 'empty', item_id = NULL, quantity = 0, updated_at = NOW()
                            WHERE compartment_id = :place
                        """),
                        {"place": compartment_id}
                    )
                    session.execute(
                        text("""
                            INSERT INTO storage_transactions (machine_id, compartment_id, item_id, action, time)
                            VALUES ('asrs', :compartment_id, :item_id, 'retrieve', :time)
                        """),
                        {"item_id": item["item_id"], "compartment_id": compartment_id, "time": datetime.now(timezone.utc)}
                    )

            session.commit()

            # Return the created order
            res2 = session.execute(
                text('SELECT * FROM orders WHERE order_id = :id'), {"id": order_id}
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
        """Get all orders with a summary of items (PostgreSQL STRING_AGG)"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    SELECT o.*,
                           STRING_AGG(CAST(oi.quantity AS TEXT) || 'x ' || i.name, ', ') AS items_summary
                    FROM orders o
                    LEFT JOIN order_items oi ON o.order_id = oi.order_id
                    LEFT JOIN storage_items i  ON oi.item_id  = i.item_id
                    GROUP BY o.order_id
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
                text('SELECT * FROM orders WHERE order_id = :id'),
                {"id": order_id}
            )
            order_row = order_res.fetchone()
            if not order_row:
                return None
            order_dict = dict(zip(order_res.keys(), order_row))

            items_res = session.execute(
                text("""
                    SELECT oi.*, i.name AS item_name, i.description AS item_description
                    FROM order_items oi
                    JOIN storage_items i ON oi.item_id = i.item_id
                    WHERE oi.order_id = :order_id
                """),
                {"order_id": order_id}
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
                {"status": status, "updated_at": datetime.now(timezone.utc), "order_id": order_id}
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
                    SELECT o.*,
                           STRING_AGG(CAST(oi.quantity AS TEXT) || 'x ' || i.name, ', ') AS items_summary
                    FROM orders o
                    LEFT JOIN order_items oi ON o.order_id = oi.order_id
                    LEFT JOIN storage_items i  ON oi.item_id  = i.item_id
                    WHERE o.order_status = :status
                    GROUP BY o.order_id
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
                    COALESCE(SUM(total_amount), 0)                            AS total_revenue,
                    COALESCE(AVG(total_amount), 0)                            AS average_order_value,
                    COUNT(*) FILTER (WHERE order_status = 'pending')          AS pending_orders,
                    COUNT(*) FILTER (WHERE order_status = 'processing')       AS processing_orders,
                    COUNT(*) FILTER (WHERE order_status = 'shipped')          AS shipped_orders,
                    COUNT(*) FILTER (WHERE order_status = 'delivered')        AS delivered_orders,
                    COUNT(*) FILTER (WHERE order_status = 'cancelled')        AS cancelled_orders
                FROM orders
            """))
            row = result.fetchone()
            return dict(zip(result.keys(), row))
        except Exception as e:
            raise Exception(f"Error fetching order statistics: {e}")
        finally:
            session.close()
