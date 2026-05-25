"""
backend/crud/asrs/subcompartment.py
===================================
Updated to use new schema (Integrated_Schema):
  storage_compartments (compartment_id TEXT PK, box_id, sub_slot CHAR(1),
                        item_id, quantity, status, machine_id)
  Old: "SubCompartments" (subcom_place, box_id, sub_id, item_id, status)

Key mapping:
  subcom_place  → compartment_id  (e.g. 'A1a')
  sub_id        → sub_slot        (e.g. 'a')
  'Occupied'    → 'occupied'
  'Empty'       → 'empty'
"""
import logging
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

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
            result = session.execute(text('SELECT * FROM storage_compartments ORDER BY compartment_id'))
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
        """Get subcompartment by compartment_id (e.g. 'A1a')"""
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text('SELECT * FROM storage_compartments WHERE compartment_id = :place'),
                {"place": place}
            )
            row = result.fetchone()
            columns = result.keys()
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
        # Normalise status to lowercase
        status_norm = status.lower() if status else 'empty'
        if status_norm == 'occupied' and not item_id:
            raise ValueError("Item ID is required for occupied status")

        session = InventorySessionLocal()
        try:
            session.execute(
                text("""
                    INSERT INTO storage_compartments (compartment_id, box_id, sub_slot, item_id, status)
                    VALUES (:compartment_id, :box_id, :sub_slot, :item_id, :status)
                """),
                {
                    "compartment_id": subcom_place,
                    "box_id": box_id,
                    "sub_slot": str(sub_id),
                    "item_id": item_id,
                    "status": status_norm,
                }
            )
            session.commit()
            logger.info("Created subcompartment: %s", subcom_place)
            return {
                "compartment_id": subcom_place,
                "box_id": box_id,
                "sub_slot": sub_id,
                "item_id": item_id,
                "status": status_norm,
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
        status_norm = status.lower() if status else 'empty'
        session = InventorySessionLocal()
        try:
            result = session.execute(
                text("""
                    UPDATE storage_compartments
                    SET status = :status, item_id = :item_id, updated_at = NOW()
                    WHERE compartment_id = :place
                """),
                {"status": status_norm, "item_id": item_id, "place": place}
            )
            session.commit()
            if result.rowcount == 0:
                raise Exception(f"SubCompartment {place} not found")
            logger.info("Updated subcompartment %s → %s", place, status_norm)
            return {"compartment_id": place, "status": status_norm, "item_id": item_id}
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
        compartment_id = f"{box_id}{sub_id}"
        session = InventorySessionLocal()
        try:
            # Check if subcompartment exists
            existing = session.execute(
                text('SELECT status FROM storage_compartments WHERE compartment_id = :place'),
                {"place": compartment_id}
            ).fetchone()

            if existing:
                if existing[0] == "occupied":
                    raise Exception(f"SubCompartment {compartment_id} is already OCCUPIED")
                session.execute(
                    text("""
                        UPDATE storage_compartments
                        SET item_id = :item_id, status = 'occupied', quantity = 1, updated_at = NOW()
                        WHERE compartment_id = :place
                    """),
                    {"item_id": item_id, "place": compartment_id}
                )
                action_taken = "updated"
            else:
                session.execute(
                    text("""
                        INSERT INTO storage_compartments (compartment_id, box_id, sub_slot, item_id, status, quantity)
                        VALUES (:compartment_id, :box_id, :sub_slot, :item_id, 'occupied', 1)
                    """),
                    {
                        "compartment_id": compartment_id,
                        "box_id": box_id,
                        "sub_slot": str(sub_id),
                        "item_id": item_id,
                    }
                )
                action_taken = "created"

            # Record transaction
            session.execute(
                text("""
                    INSERT INTO storage_transactions (machine_id, compartment_id, item_id, action, time)
                    VALUES ('asrs', :compartment_id, :item_id, 'add', :time)
                """),
                {"item_id": item_id, "compartment_id": compartment_id, "time": datetime.now(timezone.utc)}
            )
            session.commit()

            result = {
                "compartment_id": compartment_id,
                "action": action_taken,
                "status": "occupied",
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
            logger.error("Error adding product %s to %s: %s", item_id, compartment_id, e)
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
                    SELECT sc.compartment_id, sc.box_id, sc.sub_slot,
                           b.row_label, b.col_number
                    FROM storage_compartments sc
                    JOIN storage_boxes b ON sc.box_id = b.box_id
                    WHERE sc.item_id = :item_id AND sc.status = 'occupied'
                    ORDER BY b.row_label, b.col_number, sc.sub_slot
                    LIMIT :quantity
                """),
                {"item_id": item_id, "quantity": quantity}
            ).fetchall()

            if len(available) < quantity:
                raise Exception(
                    f"Only {len(available)} items available, but {quantity} requested"
                )

            retrieved = []
            for row in available:
                compartment_id, box_id, sub_slot, row_label, col_number = row
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
                    {"item_id": item_id, "compartment_id": compartment_id, "time": datetime.now(timezone.utc)}
                )
                retrieved.append({
                    "compartment_id": compartment_id,
                    "box_id": box_id,
                    "row_label": row_label,
                    "col_number": col_number,
                    "sub_slot": sub_slot,
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
