"""
backend/crud/asrs/item.py
=========================
Refactored for Integrated Schema v2 (PostgreSQL lowercase tables).
Maps internal created_at -> added_on for client compatibility.
"""
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional
from datetime import datetime


class ItemController:
    """Controller for Item operations"""

    @staticmethod
    def get_all_items() -> List[Dict[str, Any]]:
        """Get all items"""
        session = InventorySessionLocal()
        try:
            query = 'SELECT item_id, sku, name, description, item_type, unit, created_at AS added_on FROM storage_items ORDER BY item_id'
            result = session.execute(text(query))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching items: {e}")
        finally:
            session.close()

    @staticmethod
    def get_item_by_id(item_id) -> Optional[Dict[str, Any]]:
        """Get item by ID (accepts str or int)"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text('SELECT item_id, sku, name, description, item_type, unit, created_at AS added_on FROM storage_items WHERE item_id = :id'),
                {"id": int(item_id)}
            )
            item = result.fetchone()
            columns = result.keys()   # capture before close
            if not item:
                return None
            return dict(zip(columns, item))
        except Exception as e:
            raise Exception(f"Error fetching item by ID: {e}")
        finally:
            session.close()

    @staticmethod
    def create_item(item_id, name: str, description: str) -> Dict[str, Any]:
        """Create a new item.
        
        item_id is INTEGER in the DB — pass a numeric value or castable string.
        """
        session = InventorySessionLocal()
        try:
            if not item_id or not name:
                raise ValueError("Please provide item_id and name")

            session.execute(
                text("""
                    INSERT INTO storage_items (item_id, name, description, item_type, created_at, updated_at)
                    VALUES (:item_id, :name, :description, 'raw', :created_at, :created_at)
                """),
                {
                    "item_id": int(item_id),
                    "name": name,
                    "description": description or "",
                    "created_at": datetime.now(),
                }
            )
            session.commit()

            result = session.execute(
                text('SELECT item_id, sku, name, description, item_type, unit, created_at AS added_on FROM storage_items WHERE item_id = :id'),
                {"id": int(item_id)}
            )
            item = result.fetchone()
            columns = result.keys()
            return dict(zip(columns, item))
        except ValueError:
            raise
        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating item: {e}")
        finally:
            session.close()

    @staticmethod
    def delete_item(item_id) -> Dict[str, Any]:
        """Delete an item by ID"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text('DELETE FROM storage_items WHERE item_id = :id'),
                {"id": int(item_id)}
            )
            session.commit()
            if result.rowcount == 0:
                raise Exception(f"Item {item_id} not found")
            return {"success": True, "affectedRows": result.rowcount, "message": f"Item {item_id} deleted"}
        except Exception as e:
            session.rollback()
            raise Exception(f"Error deleting item: {e}")
        finally:
            session.close()

    @staticmethod
    def get_available_items_with_count() -> List[Dict[str, Any]]:
        """Get items currently stored in storage_compartments with their count"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("""
                SELECT i.item_id, i.name, COUNT(*) AS available_count
                FROM storage_items i
                JOIN storage_compartments sc ON i.item_id = sc.item_id
                WHERE sc.status = 'occupied'
                GROUP BY i.item_id, i.name
                ORDER BY i.name
            """))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching available items: {e}")
        finally:
            session.close()

    @staticmethod
    def get_item_locations(item_id) -> List[Dict[str, Any]]:
        """Get all storage locations for an item"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    SELECT sc.compartment_id AS subcom_place, 
                           b.row_label AS column_name, 
                           b.col_number AS row_number, 
                           sc.sub_slot AS sub_id
                    FROM storage_compartments sc
                    JOIN storage_boxes b ON sc.box_id = b.box_id
                    WHERE sc.item_id = :item_id AND sc.status = 'occupied'
                """),
                {"item_id": int(item_id)}
            )
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching item locations: {e}")
        finally:
            session.close()

    @staticmethod
    def check_item_id_exists(item_id) -> bool:
        """Check if an item ID exists"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text('SELECT COUNT(*) FROM storage_items WHERE item_id = :id'),
                {"id": int(item_id)}
            )
            count = result.scalar()
            return (count or 0) > 0
        except Exception as e:
            raise Exception(f"Error checking item ID: {e}")
        finally:
            session.close()

