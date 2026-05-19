"""
backend/database/inventory_db.py — Inventory Session & Helpers
==============================================================
Re-uses the single engine from db.py to avoid creating duplicate
connection pools for the same database.

`InventorySessionLocal` is an alias for `SessionLocal` — all
controllers that import it continue to work unchanged.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Dict, Any

# Re-use the engine and session factory created in db.py
from backend.database.db import SessionLocal, engine

# Backward-compatible alias: all controllers import InventorySessionLocal
InventorySessionLocal = SessionLocal


class InventoryDB:
    """Helper class for querying the inventory management database."""

    @staticmethod
    def get_all_boxes() -> List[Dict[str, Any]]:
        """Get all boxes from the database"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("SELECT * FROM boxes"))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching boxes: {e}")
        finally:
            session.close()

    @staticmethod
    def get_box(box_id: str) -> Dict[str, Any]:
        """Get a specific box by ID"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("SELECT * FROM boxes WHERE id = :id"), {"id": box_id}
            )
            box = result.fetchone()
            columns = result.keys()     # capture before close
            if not box:
                raise Exception(f"Box {box_id} not found")
            return dict(zip(columns, box))
        except Exception as e:
            raise Exception(f"Error fetching box: {e}")
        finally:
            session.close()

    @staticmethod
    def create_box(box_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new box"""
        session = InventorySessionLocal()
        try:
            columns = ", ".join(box_data.keys())
            placeholders = ", ".join([f":{k}" for k in box_data.keys()])
            query = f"INSERT INTO boxes ({columns}) VALUES ({placeholders})"
            session.execute(text(query), box_data)
            session.commit()
            return box_data
        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating box: {e}")
        finally:
            session.close()

    @staticmethod
    def get_all_items() -> List[Dict[str, Any]]:
        """Get all items from the database"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("SELECT * FROM items"))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching items: {e}")
        finally:
            session.close()

    @staticmethod
    def create_item(item_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new item"""
        session = InventorySessionLocal()
        try:
            columns = ", ".join(item_data.keys())
            placeholders = ", ".join([f":{k}" for k in item_data.keys()])
            query = f"INSERT INTO items ({columns}) VALUES ({placeholders})"
            session.execute(text(query), item_data)
            session.commit()
            return item_data
        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating item: {e}")
        finally:
            session.close()

    @staticmethod
    def get_all_subcompartments() -> List[Dict[str, Any]]:
        """Get all subcompartments from the database"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("SELECT * FROM subcompartments"))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching subcompartments: {e}")
        finally:
            session.close()

    @staticmethod
    def add_product(subcompartment_id: str, product_data: Dict[str, Any]) -> Dict[str, Any]:
        """Add a product to a subcompartment"""
        session = InventorySessionLocal()
        try:
            query = "UPDATE subcompartments SET product_id = :product_id WHERE id = :id"
            session.execute(text(query), {**product_data, "id": subcompartment_id})
            session.commit()
            return {"success": True, "subcompartment_id": subcompartment_id, "product": product_data}
        except Exception as e:
            session.rollback()
            raise Exception(f"Error adding product: {e}")
        finally:
            session.close()

    @staticmethod
    def retrieve_product(subcompartment_id: str) -> Dict[str, Any]:
        """Retrieve a product from a subcompartment"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("SELECT * FROM subcompartments WHERE id = :id"),
                {"id": subcompartment_id},
            )
            subcompartment = result.fetchone()
            columns = result.keys()     # capture before close
            if not subcompartment:
                raise Exception(f"Subcompartment {subcompartment_id} not found")
            return dict(zip(columns, subcompartment))
        except Exception as e:
            raise Exception(f"Error retrieving product: {e}")
        finally:
            session.close()

    @staticmethod
    def get_all_transactions() -> List[Dict[str, Any]]:
        """Get all transactions from the database"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("SELECT * FROM transactions"))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching transactions: {e}")
        finally:
            session.close()
