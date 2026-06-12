"""
backend/crud/asrs/transaction.py
================================
Refactored for Integrated Schema v2 (PostgreSQL lowercase tables).
Maps internal compartment_id -> subcom_place, and action values ('add' -> 'added', 'retrieve' -> 'retrieved').
"""
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional
from datetime import datetime


class TransactionController:
    """Controller for Transactions CRUD"""

    @staticmethod
    def get_all_transactions(sort: str = "id_asc", limit: int = 100) -> List[Dict[str, Any]]:
        """Get all transactions with item name joined.

        sort options:
          id_asc        — oldest first (default)
          newest_first  — latest first
          added_only    — only 'added' actions
          retrieved_only— only 'retrieved' actions
        """
        session = InventorySessionLocal()
        try:
            where_clause = ""
            if sort == "added_only":
                where_clause = "WHERE t.action = 'add'"
            elif sort == "retrieved_only":
                where_clause = "WHERE t.action = 'retrieve'"

            order_clause = "ORDER BY t.time ASC" if sort != "newest_first" else "ORDER BY t.time DESC"

            result = session.execute(
                text(f"""
                    SELECT t.tran_id, t.item_id, i.name AS item_name,
                           t.compartment_id AS subcom_place,
                           CASE t.action
                               WHEN 'add'      THEN 'added'
                               WHEN 'retrieve' THEN 'retrieved'
                               ELSE t.action
                           END AS action,
                           t.time
                    FROM storage_transactions t
                    LEFT JOIN storage_items i ON t.item_id = i.item_id
                    {where_clause}
                    {order_clause}
                    LIMIT :limit
                """),
                {"limit": limit}
            )
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching transactions: {e}")
        finally:
            session.close()

    @staticmethod
    def get_transaction_by_id(tran_id: int) -> Optional[Dict[str, Any]]:
        """Get a single transaction by ID"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    SELECT t.tran_id, t.item_id, i.name AS item_name,
                           t.compartment_id AS subcom_place,
                           CASE t.action
                               WHEN 'add'      THEN 'added'
                               WHEN 'retrieve' THEN 'retrieved'
                               ELSE t.action
                           END AS action,
                           t.time
                    FROM storage_transactions t
                    LEFT JOIN storage_items i ON t.item_id = i.item_id
                    WHERE t.tran_id = :tran_id
                """),
                {"tran_id": tran_id}
            )
            row = result.fetchone()
            if not row:
                return None
            return dict(zip(result.keys(), row))
        except Exception as e:
            raise Exception(f"Error fetching transaction {tran_id}: {e}")
        finally:
            session.close()

    @staticmethod
    def get_transactions_by_item_id(item_id) -> List[Dict[str, Any]]:
        """Get all transactions for a specific item"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    SELECT t.tran_id, t.item_id, i.name AS item_name,
                           t.compartment_id AS subcom_place,
                           CASE t.action
                               WHEN 'add'      THEN 'added'
                               WHEN 'retrieve' THEN 'retrieved'
                               ELSE t.action
                           END AS action,
                           t.time
                    FROM storage_transactions t
                    LEFT JOIN storage_items i ON t.item_id = i.item_id
                    WHERE t.item_id = :item_id
                    ORDER BY t.time DESC
                """),
                {"item_id": int(item_id)}
            )
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching transactions for item {item_id}: {e}")
        finally:
            session.close()

    @staticmethod
    def create_transaction(transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a single transaction record"""
        session = InventorySessionLocal()
        try:
            item_id = transaction_data.get("item_id")
            action = transaction_data.get("action")
            subcom_place = transaction_data.get("subcom_place")

            if not item_id or not action:
                raise ValueError("item_id and action are required")

            db_action = 'add' if action in ['added', 'add'] else 'retrieve'

            result = session.execute(
                text("""
                    INSERT INTO storage_transactions (item_id, compartment_id, action, time)
                    VALUES (:item_id, :subcom_place, :action, :time)
                    RETURNING tran_id
                """),
                {
                    "item_id":      int(item_id),
                    "subcom_place": subcom_place,
                    "action":       db_action,
                    "time":         datetime.now(),
                }
            )
            tran_id = result.fetchone()[0]
            session.commit()
            return {
                "tran_id":      tran_id,
                "item_id":      item_id,
                "subcom_place": subcom_place,
                "action":       action,
            }
        except ValueError:
            raise
        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating transaction: {e}")
        finally:
            session.close()

    @staticmethod
    def create_multiple_transactions(transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create multiple transaction records atomically"""
        session = InventorySessionLocal()
        try:
            created = []
            for td in transactions:
                item_id = td.get("item_id")
                action = td.get("action")
                subcom_place = td.get("subcom_place")
                if not item_id or not action:
                    raise ValueError("Each transaction must have item_id and action")
                
                db_action = 'add' if action in ['added', 'add'] else 'retrieve'

                result = session.execute(
                    text("""
                        INSERT INTO storage_transactions (item_id, compartment_id, action, time)
                        VALUES (:item_id, :subcom_place, :action, :time)
                        RETURNING tran_id
                    """),
                    {
                        "item_id":      int(item_id),
                        "subcom_place": subcom_place,
                        "action":       db_action,
                        "time":         datetime.now(),
                    }
                )
                tran_id = result.fetchone()[0]
                created.append({
                    "tran_id":      tran_id,
                    "item_id":      item_id,
                    "subcom_place": subcom_place,
                    "action":       action,
                })
            session.commit()
            return created
        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating transactions: {e}")
        finally:
            session.close()

