"""
backend/crud/asrs/subcompartment.py
===================================
Refactored for Integrated Schema v2 (PostgreSQL lowercase tables).
Maps internal compartment_id -> subcom_place, sub_slot -> sub_id, and capitalized statuses -> lowercase.
"""
import logging
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional
from datetime import datetime

from backend.stations.asrs.asrs_singleton import asrs_controller

logger = logging.getLogger(__name__)
asrs = asrs_controller


class SubCompartmentController:
    """Controller for SubCompartment operations"""

    @staticmethod
    def get_all_subcompartments() -> List[Dict[str, Any]]:
        """Get all subcompartments"""
        session = InventorySessionLocal()
        try:
            query = """
                SELECT compartment_id AS subcom_place, 
                       box_id, 
                       sub_slot AS sub_id, 
                       item_id, 
                       CASE status 
                           WHEN 'occupied' THEN 'Occupied' 
                           WHEN 'empty' THEN 'Empty' 
                           ELSE INITCAP(status) 
                       END AS status
                FROM storage_compartments 
                ORDER BY compartment_id
            """
            result = session.execute(text(query))
            columns = result.keys()
            rows = [dict(zip(columns, row)) for row in result.fetchall()]
            logger.info("Fetched %d subcompartments", len(rows))
            return rows
        except Exception as e:
            logger.error("Error fetching subcompartments: %s", e)
            raise Exception(f"Error fetching subcompartments: {e}")
        finally:
            session.close()

    @staticmethod
    def get_subcompartment_by_place(place: str) -> Optional[Dict[str, Any]]:
        """Get subcompartment by place code (e.g. 'A1a')"""
        session = InventorySessionLocal()
        try:
            query = """
                SELECT compartment_id AS subcom_place, 
                       box_id, 
                       sub_slot AS sub_id, 
                       item_id, 
                       CASE status 
                           WHEN 'occupied' THEN 'Occupied' 
                           WHEN 'empty' THEN 'Empty' 
                           ELSE INITCAP(status) 
                       END AS status
                FROM storage_compartments 
                WHERE compartment_id = :place
            """
            result = session.execute(text(query), {"place": place})
            row = result.fetchone()
            columns = result.keys()   # capture before close
            if not row:
                return None
            return dict(zip(columns, row))
        except Exception as e:
            logger.error("Error fetching subcompartment %s: %s", place, e)
            raise Exception(f"Error fetching subcompartment by place: {e}")
        finally:
            session.close()

    @staticmethod
    def create_subcompartment(
        subcom_place: str, box_id: str, sub_id,
        item_id: Optional[Any], status: str
    ) -> Dict[str, Any]:
        """Create a new subcompartment"""
        if status.lower() == 'occupied' and not item_id:
            raise ValueError("Item ID is required for Occupied status")

        session = InventorySessionLocal()
        try:
            db_status = status.lower()
            db_sub_slot = str(sub_id)
            session.execute(
                text("""
                    INSERT INTO storage_compartments (box_id, sub_slot, item_id, status)
                    VALUES (:box_id, :sub_slot, :item_id, :status)
                """),
                {
                    "box_id": box_id,
                    "sub_slot": db_sub_slot,
                    "item_id": int(item_id) if item_id else None,
                    "status": db_status,
                }
            )
            session.commit()
            logger.info("Created subcompartment: %s", subcom_place)
            return {
                "subcom_place": f"{box_id}{db_sub_slot}",
                "box_id": box_id,
                "sub_id": sub_id,
                "item_id": item_id,
                "status": status,
            }
        except ValueError:
            raise
        except Exception as e:
            session.rollback()
            logger.error("Error creating subcompartment %s: %s", subcom_place, e)
            raise Exception(f"Error creating subcompartment: {e}")
        finally:
            session.close()

    @staticmethod
    def update_status(place: str, status: str, item_id: Optional[Any] = None) -> Dict[str, Any]:
        """Update subcompartment status and optionally item_id"""
        session = InventorySessionLocal()
        try:
            db_status = status.lower()
            result = session.execute(
                text("""
                    UPDATE storage_compartments
                    SET status = :status, item_id = :item_id
                    WHERE compartment_id = :place
                """),
                {"status": db_status, "item_id": int(item_id) if item_id else None, "place": place}
            )
            session.commit()
            if result.rowcount == 0:
                raise Exception(f"SubCompartment {place} not found")
            logger.info("Updated subcompartment %s → %s", place, status)
            return {"subcom_place": place, "status": status, "item_id": item_id}
        except Exception as e:
            session.rollback()
            logger.error("Error updating subcompartment %s: %s", place, e)
            raise Exception(f"Error updating subcompartment status: {e}")
        finally:
            session.close()

    @staticmethod
    def delete_subcompartment(place: str) -> Dict[str, Any]:
        """Delete a subcompartment"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text('DELETE FROM storage_compartments WHERE compartment_id = :place'),
                {"place": place}
            )
            session.commit()
            if result.rowcount == 0:
                raise Exception(f"SubCompartment {place} not found")
            logger.info("Deleted subcompartment: %s", place)
            return {"affectedRows": result.rowcount}
        except Exception as e:
            session.rollback()
            logger.error("Error deleting subcompartment %s: %s", place, e)
            raise Exception(f"Error deleting subcompartment: {e}")
        finally:
            session.close()

    @staticmethod
    def add_product(box_id: str, sub_id: str, item_id) -> Dict[str, Any]:
        """Add product to storage (stores item in subcompartment + records transaction)"""
        subcom_place = f"{box_id}{sub_id}"
        session = InventorySessionLocal()
        try:
            # Check if subcompartment exists
            existing = session.execute(
                text('SELECT status FROM storage_compartments WHERE compartment_id = :place'),
                {"place": subcom_place}
            ).fetchone()

            if existing:
                if existing[0] == "occupied":
                    raise Exception(f"SubCompartment {subcom_place} is already OCCUPIED")
                session.execute(
                    text("""
                        UPDATE storage_compartments
                        SET item_id = :item_id, status = 'occupied'
                        WHERE compartment_id = :place
                    """),
                    {"item_id": int(item_id), "place": subcom_place}
                )
                action_taken = "updated"
            else:
                session.execute(
                    text("""
                        INSERT INTO storage_compartments (box_id, sub_slot, item_id, status)
                        VALUES (:box_id, :sub_slot, :item_id, 'occupied')
                    """),
                    {
                        "box_id": box_id,
                        "sub_slot": str(sub_id),
                        "item_id": int(item_id),
                    }
                )
                action_taken = "created"

            # Record transaction
            session.execute(
                text("""
                    INSERT INTO storage_transactions (item_id, compartment_id, action, time)
                    VALUES (:item_id, :subcom_place, 'add', :time)
                """),
                {"item_id": int(item_id), "subcom_place": subcom_place, "time": datetime.now()}
            )
            session.commit()

            result = {
                "subcom_place": subcom_place,
                "action": action_taken,
                "status": "Occupied",
                "item_id": item_id,
            }

            # ASRS PLC command (non-blocking)
            try:
                command = f"{box_id}S"
                asrs_result = asrs.process_command(command)
                result["asrs_status"] = "success"
                result["asrs_message"] = asrs_result.get("message", "OK")
            except Exception as asrs_err:
                result["asrs_status"] = "error"
                result["asrs_message"] = str(asrs_err)
                logger.warning("ASRS command failed (DB committed): %s", asrs_err)

            return result

        except Exception as e:
            session.rollback()
            logger.error("Error adding product %s to %s: %s", item_id, subcom_place, e)
            raise Exception(f"Error adding product: {e}")
        finally:
            session.close()

    @staticmethod
    def retrieve_product(item_id, quantity: int) -> Dict[str, Any]:
        """Retrieve product from storage (column-wise priority, marks as empty, records transaction)"""
        session = InventorySessionLocal()
        try:
            available = session.execute(
                text("""
                    SELECT sc.compartment_id AS subcom_place, sc.box_id, sc.sub_slot AS sub_id,
                           b.row_label AS column_name, b.col_number AS row_number
                    FROM storage_compartments sc
                    JOIN storage_boxes b ON sc.box_id = b.box_id
                    WHERE sc.item_id = :item_id AND sc.status = 'occupied'
                    ORDER BY b.row_label, b.col_number, sc.sub_slot
                    LIMIT :quantity
                """),
                {"item_id": int(item_id), "quantity": quantity}
            ).fetchall()

            if len(available) < quantity:
                raise Exception(
                    f"Only {len(available)} items available, but {quantity} requested"
                )

            retrieved = []
            for row in available:
                subcom_place, box_id, sub_id, col_name, row_num = row
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
                    {"item_id": int(item_id), "subcom_place": subcom_place, "time": datetime.now()}
                )
                retrieved.append({
                    "subcom_place": subcom_place,
                    "box_id": box_id,
                    "column_name": col_name,
                    "row_number": row_num,
                    "sub_id": sub_id,
                })

            session.commit()
            logger.info("Retrieved %d of item %s", len(retrieved), item_id)
            return {"item_id": item_id, "quantity": len(retrieved), "locations": retrieved}

        except Exception as e:
            session.rollback()
            logger.error("Error retrieving %s qty %d: %s", item_id, quantity, e)
            raise Exception(f"Error retrieving product: {e}")
        finally:
            session.close()

