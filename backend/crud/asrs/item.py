"""
backend/crud/asrs/item.py
=========================
Updated to use new schema (Integrated_Schema):
  storage_items (item_id SERIAL PK, name, description, sku, item_type, unit, machine_id)
  Old: "Items" (item_id, name, description, added_on)

item_type must be one of: 'raw', 'finished', 'tool', 'consumable'
"""
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional


class ItemController:
    """Controller for Item operations"""

    @staticmethod
    def get_all_items() -> List[Dict[str, Any]]:
        """Get all items"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text('SELECT * FROM storage_items ORDER BY item_id'))
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
                text('SELECT * FROM storage_items WHERE item_id = :id'),
                {"id": item_id}
            )
            item = result.fetchone()
            columns = result.keys()
            if not item:
                return None
            return dict(zip(columns, item))
        except Exception as e:
            raise Exception(f"Error fetching item by ID: {e}")
        finally:
            session.close()

    @staticmethod
    def create_item(item_id, name: str, description: str,
                    sku: str = None, item_type: str = 'raw', unit: str = 'pcs') -> Dict[str, Any]:
        """Create a new item.
        item_id is auto-generated (SERIAL) — pass None to auto-assign.
        item_type must be: 'raw', 'finished', 'tool', 'consumable'
        """
        session = InventorySessionLocal()
        try:
            if not name:
                raise ValueError("Please provide item name")

            valid_types = ('raw', 'finished', 'tool', 'consumable')
            if item_type not in valid_types:
                item_type = 'raw'

            if item_id is not None:
                result = session.execute(
                    text("""
                        INSERT INTO storage_items (item_id, name, description, sku, item_type, unit)
                        VALUES (:item_id, :name, :description, :sku, :item_type, :unit)
                        RETURNING item_id
                    """),
                    {
                        "item_id": int(item_id),
                        "name": name,
                        "description": description or "",
                        "sku": sku,
                        "item_type": item_type,
                        "unit": unit,
                    }
                )
            else:
                result = session.execute(
                    text("""
                        INSERT INTO storage_items (name, description, sku, item_type, unit)
                        VALUES (:name, :description, :sku, :item_type, :unit)
                        RETURNING item_id
                    """),
                    {
                        "name": name,
                        "description": description or "",
                        "sku": sku,
                        "item_type": item_type,
                        "unit": unit,
                    }
                )
            new_id = result.fetchone()[0]
            session.commit()

            row = session.execute(
                text('SELECT * FROM storage_items WHERE item_id = :id'),
                {"id": new_id}
            ).fetchone()
            return dict(zip(result.keys() if row is None else
                           session.execute(text('SELECT * FROM storage_items WHERE item_id = :id'), {"id": new_id}).keys(),
                           row)) if row else {"item_id": new_id, "name": name}
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
        """Get items currently stored in compartments with their count"""
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
                    SELECT sc.compartment_id, b.row_label, b.col_number, sc.sub_slot
                    FROM storage_compartments sc
                    JOIN storage_boxes b ON sc.box_id = b.box_id
                    WHERE sc.item_id = :item_id AND sc.status = 'occupied'
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
                text('SELECT COUNT(*) FROM storage_items WHERE item_id = :id'),
                {"id": item_id}
            )
            count = result.scalar()
            return (count or 0) > 0
        except Exception as e:
            raise Exception(f"Error checking item ID: {e}")
        finally:
            session.close()
