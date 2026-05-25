"""
backend/crud/asrs/transaction.py
================================
Updated to use new schema (Integrated_Schema):
  storage_transactions (tran_id, machine_id, time, compartment_id, item_id,
                        action, quantity, operator_id, notes)
  Old: "Transactions" (tran_id, item_id, subcom_place, action, time)

action must be one of: 'add', 'retrieve', 'transfer', 'adjust', 'audit'
Old 'added' → 'add', old 'retrieved' → 'retrieve'
"""
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone


# Map old action names to new schema constraints
_ACTION_MAP = {
    'added': 'add',
    'retrieved': 'retrieve',
    'ordered': 'add',
    'transferred': 'transfer',
    'adjusted': 'adjust',
    'audited': 'audit',
}


def _normalise_action(action: str) -> str:
    return _ACTION_MAP.get(action, action)


class TransactionController:
    """Controller for Transactions CRUD"""

    @staticmethod
    def get_all_transactions(sort: str = "id_asc", limit: int = 100) -> List[Dict[str, Any]]:
        """Get all transactions with item name joined.

        sort options:
          id_asc        — oldest first (default)
          newest_first  — latest first
          added_only    — only 'add' actions
          retrieved_only— only 'retrieve' actions
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
                           t.compartment_id, t.action, t.time, t.notes
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
                           t.compartment_id, t.action, t.time, t.notes
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
                           t.compartment_id, t.action, t.time, t.notes
                    FROM storage_transactions t
                    LEFT JOIN storage_items i ON t.item_id = i.item_id
                    WHERE t.item_id = :item_id
                    ORDER BY t.time DESC
                """),
                {"item_id": item_id}
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
            action = _normalise_action(transaction_data.get("action", ""))
            compartment_id = transaction_data.get("compartment_id") or transaction_data.get("subcom_place")
            notes = transaction_data.get("notes")

            if not item_id or not action:
                raise ValueError("item_id and action are required")

            result = session.execute(
                text("""
                    INSERT INTO storage_transactions (machine_id, compartment_id, item_id, action, time, notes)
                    VALUES ('asrs', :compartment_id, :item_id, :action, :time, :notes)
                    RETURNING tran_id
                """),
                {
                    "item_id":       item_id,
                    "compartment_id": compartment_id,
                    "action":        action,
                    "time":          datetime.now(timezone.utc),
                    "notes":         notes,
                }
            )
            tran_id = result.fetchone()[0]
            session.commit()
            return {
                "tran_id":        tran_id,
                "item_id":        item_id,
                "compartment_id": compartment_id,
                "action":         action,
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
                action = _normalise_action(td.get("action", ""))
                compartment_id = td.get("compartment_id") or td.get("subcom_place")
                notes = td.get("notes")
                if not item_id or not action:
                    raise ValueError("Each transaction must have item_id and action")
                result = session.execute(
                    text("""
                        INSERT INTO storage_transactions (machine_id, compartment_id, item_id, action, time, notes)
                        VALUES ('asrs', :compartment_id, :item_id, :action, :time, :notes)
                        RETURNING tran_id
                    """),
                    {
                        "item_id":        item_id,
                        "compartment_id": compartment_id,
                        "action":         action,
                        "time":           datetime.now(timezone.utc),
                        "notes":          notes,
                    }
                )
                tran_id = result.fetchone()[0]
                created.append({
                    "tran_id":        tran_id,
                    "item_id":        item_id,
                    "compartment_id": compartment_id,
                    "action":         action,
                })
            session.commit()
            return created
        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating transactions: {e}")
        finally:
            session.close()
