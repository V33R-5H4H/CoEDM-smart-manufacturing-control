"""
backend/crud/asrs/box.py
========================
Refactored for Integrated Schema v2 (PostgreSQL case-insensitive lowercase tables).
Maps internal `row_label` -> `column_name` and `col_number` -> `row_number` for client compatibility.
"""
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional


class BoxController:
    """Controller for Box operations"""

    @staticmethod
    def get_boxes_with_empty_compartments() -> List[Dict[str, Any]]:
        """Get boxes that have at least one empty storage_compartment"""
        session = InventorySessionLocal()
        try:
            query = """
                SELECT DISTINCT b.box_id, b.row_label AS column_name, b.col_number AS row_number
                FROM storage_boxes b
                JOIN storage_compartments sc ON b.box_id = sc.box_id
                WHERE sc.status = 'empty'
            """
            result = session.execute(text(query))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching boxes with empty compartments: {e}")
        finally:
            session.close()

    @staticmethod
    def get_all_boxes() -> List[Dict[str, Any]]:
        """Get all boxes"""
        session = InventorySessionLocal()
        try:
            query = 'SELECT box_id, row_label AS column_name, col_number AS row_number FROM storage_boxes'
            result = session.execute(text(query))
            columns = result.keys()
            return [dict(zip(columns, row)) for row in result.fetchall()]
        except Exception as e:
            raise Exception(f"Error fetching all boxes: {e}")
        finally:
            session.close()

    @staticmethod
    def get_box_by_id(box_id: str) -> Optional[Dict[str, Any]]:
        """Get box by ID"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text('SELECT box_id, row_label AS column_name, col_number AS row_number FROM storage_boxes WHERE box_id = :id'),
                {"id": box_id}
            )
            box = result.fetchone()
            columns = result.keys()   # capture before close
            if not box:
                return None
            return dict(zip(columns, box))
        except Exception as e:
            raise Exception(f"Error fetching box by ID: {e}")
        finally:
            session.close()

    @staticmethod
    def create_box(box_id: str, column_name: str, row_number: int) -> Dict[str, Any]:
        """Create a new box"""
        session = InventorySessionLocal()
        try:
            if not box_id or not column_name or row_number is None:
                raise ValueError("Please provide boxId, columnName and rowNumber")

            # In storage_boxes: column_name maps to row_label, row_number maps to col_number
            session.execute(
                text('INSERT INTO storage_boxes (row_label, col_number, machine_id) VALUES (:row_label, :col_number, \'asrs\')'),
                {"row_label": column_name, "col_number": row_number}
            )
            session.commit()
            return {"box_id": f"{column_name}{row_number}", "column_name": column_name, "row_number": row_number}
        except ValueError:
            raise
        except Exception as e:
            session.rollback()
            raise Exception(f"Error creating box: {e}")
        finally:
            session.close()

    @staticmethod
    def delete_box(box_id: str) -> Dict[str, Any]:
        """Delete a box by ID"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text('DELETE FROM storage_boxes WHERE box_id = :id'),
                {"id": box_id}
            )
            session.commit()
            if result.rowcount == 0:
                raise Exception(f"Box {box_id} not found")
            return {"success": True, "affectedRows": result.rowcount, "message": f"Box {box_id} deleted"}
        except Exception as e:
            session.rollback()
            raise Exception(f"Error deleting box: {e}")
        finally:
            session.close()

    @staticmethod
    def get_filled_counts() -> Dict[str, int]:
        """Get count of occupied storage_compartments per box"""
        session = InventorySessionLocal()
        try:
            result = session.execute(text("""
                SELECT box_id, COUNT(*) AS filled_count
                FROM storage_compartments
                WHERE item_id IS NOT NULL AND status = 'occupied'
                GROUP BY box_id
            """))
            return {row.box_id: row.filled_count for row in result}
        except Exception as e:
            raise Exception(f"Error fetching filled counts: {e}")
        finally:
            session.close()

