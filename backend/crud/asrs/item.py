"""
backend/crud/asrs/item.py
=========================
NOTE — PostgreSQL case sensitivity:
Tables were created with double-quotes → must query with double-quotes:
  "Items", "SubCompartments", "Boxes"
item_id in "Items" is INTEGER — pass as int, not str.
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
            result = session.execute(text('SELECT * FROM "Items" ORDER BY item_id'))
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
                text('SELECT * FROM "Items" WHERE item_id = :id'),
                {"id": item_id}
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
                    INSERT INTO "Items" (item_id, name, description, added_on)
                    VALUES (:item_id, :name, :description, :added_on)
                """),
                {
                    "item_id": int(item_id),
                    "name": name,
                    "description": description or "",
                    "added_on": datetime.now(),
                }
            )
            session.commit()

            result = session.execute(
                text('SELECT * FROM "Items" WHERE item_id = :id'),
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
                text('DELETE FROM "Items" WHERE item_id = :id'),
                {"id": item_id}
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
        """Get items currently stored in SubCompartments with their count"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("""
                SELECT i.item_id, i.name, COUNT(*) AS available_count
                FROM "Items" i
                JOIN "SubCompartments" sc ON i.item_id = sc.item_id
                WHERE sc.status = 'Occupied'
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
                    SELECT sc.subcom_place, b.column_name, b.row_number, sc.sub_id
                    FROM "SubCompartments" sc
                    JOIN "Boxes" b ON sc.box_id = b.box_id
                    WHERE sc.item_id = :item_id AND sc.status = 'Occupied'
                """),
                {"item_id": item_id}
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
                text('SELECT COUNT(*) FROM "Items" WHERE item_id = :id'),
                {"id": item_id}
            )
            count = result.scalar()
            return (count or 0) > 0
        except Exception as e:
            raise Exception(f"Error checking item ID: {e}")
        finally:
            session.close()
