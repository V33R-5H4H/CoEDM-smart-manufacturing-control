import asyncio
"""
ASRS Logic Module

Implements the core orchestration algorithm:
1. Update database first
2. If DB update succeeds → compute PLC command
3. Call ASRSController.process_command(command)

This ensures:
- Database consistency (no orphaned PLC commands)
- Proper transaction isolation
- Atomic operations for storage and retrieval
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy import text
from backend.database.inventory_db import InventorySessionLocal
from backend.stations.asrs.asrs_singleton import asrs_controller
import logging

logger = logging.getLogger(__name__)


class ASRSLogic:
    """
    Central logic for ASRS operations coordinating database updates
    with PLC control commands.
    
    Algorithm:
    1. Validate inputs
    2. Update database (with transaction rollback on failure)
    3. Only if DB succeeds → extract box IDs and send PLC commands
    4. Return comprehensive result (DB + PLC status)
    """

    def __init__(self):
        self.asrs_controller = asrs_controller

    # ============================================================================
    # OPERATION 1: ADD PRODUCT (STORE COMMAND)
    # ============================================================================

    def add_product_with_asrs(self, box_id: str, sub_id: str, item_id: str) -> Dict[str, Any]:
        """
        Add product to storage and trigger ASRS store command.
        
        Algorithm:
        1. Validate inputs
        2. Check if item and box exist in DB
        3. Check if subcompartment exists and is empty
        4. Send PLC store command (e.g., "A1S")
        5. ONLY IF PLC succeeds → Create/update subcompartment record in DB and record transaction
        6. Return combined result
        
        Args:
            box_id: Box identifier (e.g., "A1")
            sub_id: Sub-compartment ID (1-7)
            item_id: Item identifier
        
        Returns:
            {
                "success": bool,
                "db_status": "OK" | "FAILED",
                "db_operation": "created" | "updated",
                "subcom_place": "A11",
                "plc_status": "OK" | "ERROR",
                "plc_command": "A1S",
                "message": str
            }
        
        Raises:
            ValueError: If inputs invalid
            Exception: If DB or PLC operation fails
        """
        session = InventorySessionLocal()
        subcom_place = f"{box_id}{sub_id}"

        try:
            logger.info(f"add_product_with_asrs called: boxId={box_id}, subId={sub_id}, itemId={item_id}")

            # STEP 1: Validate inputs
            if not box_id or sub_id is None or not item_id:
                logger.error(f"Invalid inputs: boxId={box_id}, subId={sub_id}, itemId={item_id}")
                raise ValueError("Invalid inputs: box_id, subId, and itemId required")

            # Convert item_id to int if possible to match schema type
            try:
                item_id_val = int(item_id)
            except (ValueError, TypeError):
                item_id_val = item_id

            # STEP 2: Check if item exists
            logger.info(f"Checking if item exists: {item_id}")
            item_check = session.execute(
                text('SELECT item_id FROM storage_items WHERE item_id = :item_id'),
                {"item_id": item_id_val}
            ).fetchone()
            if not item_check:
                logger.error(f"Item not found: {item_id}")
                session.close()
                raise ValueError(f"Item {item_id} does not exist")
            logger.info(f"Item found: {item_id}")

            # STEP 3: Check if box exists
            logger.info(f"Checking if box exists: {box_id}")
            box_check = session.execute(
                text('SELECT box_id FROM storage_boxes WHERE box_id = :box_id'),
                {"box_id": box_id}
            ).fetchone()
            if not box_check:
                logger.error(f"Box not found: {box_id}")
                session.close()
                raise ValueError(f"Box {box_id} does not exist")
            logger.info(f"Box found: {box_id}")

            # STEP 4: Send PLC command first
            store_command = f"{box_id}S"
            try:
                logger.info(f"Sending ASRS store command: {store_command}")
                plc_result = self.asrs_controller.run(store_command)
                logger.info(f"ASRS command executed: {store_command} -> {plc_result}")
                plc_status = "OK"
            except Exception as plc_error:
                logger.error(f"PLC error: {plc_error}", exc_info=True)
                session.close()
                return {
                    "success": False,
                    "db_status": None,
                    "db_operation": None,
                    "subcom_place": subcom_place,
                    "plc_status": "ERROR",
                    "plc_command": store_command,
                    "plc_result": {"success": False, "command": store_command, "error": str(plc_error)},
                    "message": f"PLC error: {plc_error}"
                }

            # STEP 5: Only if PLC succeeded, update DB
            logger.info(f"PLC success, now updating DB for subcompartment: {subcom_place}")
            # Check if subcompartment exists
            existing_subcom = session.execute(
                text('SELECT status FROM storage_compartments WHERE compartment_id = :place'),
                {"place": subcom_place}
            ).fetchone()
            db_operation = None
            if existing_subcom:
                current_status = existing_subcom[0]
                logger.info(f"SubCompartment {subcom_place} exists with status: {current_status}")
                if current_status.lower() == "occupied":
                    logger.error(f"SubCompartment {subcom_place} is already OCCUPIED")
                    session.rollback()
                    session.close()
                    return {
                        "success": False,
                        "db_status": "FAILED",
                        "db_operation": None,
                        "subcom_place": subcom_place,
                        "plc_status": "OK",
                        "plc_command": store_command,
                        "plc_result": plc_result,
                        "message": f"Subcompartment {subcom_place} is already OCCUPIED"
                    }
                else:
                    # Update empty subcompartment
                    logger.info(f"Updating empty subcompartment {subcom_place} to occupied")
                    session.execute(
                        text("""
                            UPDATE storage_compartments
                            SET item_id = :item_id, status = 'occupied', quantity = 1
                            WHERE compartment_id = :place
                        """),
                        {"item_id": item_id_val, "place": subcom_place}
                    )
                    db_operation = "updated"
            else:
                # Create new subcompartment
                logger.info(f"Creating new subcompartment: {subcom_place}")
                session.execute(
                    text("""
                        INSERT INTO storage_compartments
                        (box_id, sub_slot, item_id, status, quantity)
                        VALUES (:box_id, :sub_slot, :item_id, 'occupied', 1)
                    """),
                    {
                        "box_id": box_id,
                        "sub_slot": str(sub_id),
                        "item_id": item_id_val
                    }
                )
                db_operation = "created"

            # Record transaction
            logger.info(f"Recording transaction: item={item_id}, place={subcom_place}, action=add")
            session.execute(
                text("""
                    INSERT INTO storage_transactions
                    (item_id, compartment_id, action, time)
                    VALUES (:item_id, :subcom_place, 'add', :time)
                """),
                {"item_id": item_id_val, "subcom_place": subcom_place, "time": datetime.now()}
            )

            # Commit database changes
            logger.info(f"Committing database transaction for {subcom_place}")
            session.commit()
            logger.info(f"Database committed successfully: {subcom_place} ({db_operation})")
            session.close()

            final_result = {
                "success": True,
                "db_status": "OK",
                "db_operation": db_operation,
                "subcom_place": subcom_place,
                "plc_status": plc_status,
                "plc_command": store_command,
                "plc_result": plc_result,
                "message": f"Product {item_id} stored successfully"
            }
            logger.info(f"add_product_with_asrs completed successfully: {final_result}")
            return final_result

        except Exception as e:
            logger.error(f"Exception in add_product_with_asrs: {type(e).__name__}: {e}", exc_info=True)
            session.rollback()
            session.close()
            raise Exception(f"Error in add_product_with_asrs: {str(e)}")

    # ============================================================================
    # OPERATION 2: RETRIEVE PRODUCT (RETRIEVAL COMMANDS)
    # ============================================================================

    def retrieve_product_with_asrs(self, item_id: str, quantity: int) -> Dict[str, Any]:
        """
        Retrieve product from storage and trigger ASRS retrieval commands.
        
        Algorithm:
        1. Validate inputs
        2. Find occupied subcompartments (column-wise ordering)
        3. Select N locations = quantity
        4. Extract unique box IDs
        5. Send PLC retrieval commands for each box
        6. ONLY IF ALL PLC succeed → Update DB: mark subcompartments as empty and record transactions
        7. Return combined result
        
        Args:
            item_id: Item identifier
            quantity: Number of items to retrieve
        
        Returns:
            {
                "success": bool,
                "db_status": "OK" | "FAILED",
                "quantity_retrieved": int,
                "locations": [
                    {"subcom_place": "A11", "box_id": "A1", "column_name": "A", "row_number": 1},
                    ...
                ],
                "plc_status": "OK" | "PARTIAL" | "ERROR",
                "plc_commands_sent": ["A1", "B2"],
                "plc_results": [
                    {"command": "A1", "success": True},
                    {"command": "B2", "success": True}
                ],
                "message": str
            }
        
        Raises:
            ValueError: If quantity insufficient or inputs invalid
            Exception: If DB operation fails
        """
        session = InventorySessionLocal()

        try:
            # STEP 1: Validate inputs
            if not item_id or not isinstance(quantity, int) or quantity <= 0:
                raise ValueError("Invalid inputs: item_id and positive quantity required")

            # Convert item_id to int if possible to match schema type
            try:
                item_id_val = int(item_id)
            except (ValueError, TypeError):
                item_id_val = item_id

            # STEP 2: Find occupied subcompartments (column-wise priority)
            available = session.execute(
                text("""
                    SELECT sc.compartment_id AS subcom_place, sc.box_id, sc.sub_slot AS sub_id,
                           b.row_label AS column_name, b.col_number AS row_number
                    FROM storage_compartments sc
                    JOIN storage_boxes b ON sc.box_id = b.box_id
                    WHERE sc.item_id = :item_id AND sc.status = 'occupied'
                    ORDER BY b.row_label, b.col_number, sc.sub_slot
                    LIMIT :quantity
                    FOR UPDATE SKIP LOCKED
                """),
                {"item_id": item_id_val, "quantity": quantity}
            ).fetchall()

            if len(available) < quantity:
                session.close()
                raise ValueError(
                    f"Insufficient stock: {len(available)} available, "
                    f"but {quantity} requested"
                )

            # STEP 3: Extract unique box IDs for PLC commands
            box_ids = set()
            locations_data = []
            for row in available:
                subcom_place = row[0]
                box_id = row[1]
                sub_id = row[2]
                column_name = row[3]
                row_number = row[4]
                box_ids.add(box_id)
                locations_data.append({
                    "subcom_place": subcom_place,
                    "box_id": box_id,
                    "sub_id": sub_id,
                    "column_name": column_name,
                    "row_number": row_number
                })

            # STEP 4: Send PLC commands for each box
            plc_results = []
            plc_status = "OK"
            plc_failed = False
            for box_id in sorted(box_ids):
                retrieval_command = box_id  # e.g., "A1" (no 'S' suffix)
                try:
                    result = self.asrs_controller.run(retrieval_command)
                    plc_results.append({
                        "command": retrieval_command,
                        "success": True,
                        "result": result
                    })
                except Exception as cmd_error:
                    plc_results.append({
                        "command": retrieval_command,
                        "success": False,
                        "error": str(cmd_error)
                    })
                    plc_status = "ERROR"
                    plc_failed = True

            if plc_failed:
                session.close()
                return {
                    "success": False,
                    "db_status": None,
                    "quantity_retrieved": 0,
                    "locations": locations_data,
                    "plc_status": plc_status,
                    "plc_commands_sent": sorted(list(box_ids)),
                    "plc_results": plc_results,
                    "message": "PLC command(s) failed. DB not updated."
                }

            # STEP 5: Only if ALL PLC succeeded, update DB
            for location in locations_data:
                subcom_place = location["subcom_place"]
                # Mark subcompartment as empty
                session.execute(
                    text("""
                        UPDATE storage_compartments
                        SET status = 'empty', item_id = NULL
                        WHERE compartment_id = :place
                    """),
                    {"place": subcom_place}
                )
                # Record transaction
                session.execute(
                    text("""
                        INSERT INTO storage_transactions
                        (item_id, compartment_id, action, time)
                        VALUES (:item_id, :subcom_place, 'retrieve', :time)
                    """),
                    {"item_id": item_id_val, "subcom_place": subcom_place, "time": datetime.now()}
                )
            session.commit()
            session.close()
            return {
                "success": True,
                "db_status": "OK",
                "quantity_retrieved": len(locations_data),
                "locations": locations_data,
                "plc_status": plc_status,
                "plc_commands_sent": sorted(list(box_ids)),
                "plc_results": plc_results,
                "message": f"Retrieved {len(locations_data)} items successfully"
            }

        except Exception as e:
            session.rollback()
            session.close()
            raise Exception(f"Error in retrieve_product_with_asrs: {str(e)}")

    # ============================================================================
    # ============================================================================

    def retrieve_from_specific_location(self, box_id: str, sub_id: str, item_id: int) -> Dict[str, Any]:
        """
        Retrieve product from a specific subcompartment location.
        
        Algorithm:
        1. Validate that the subcompartment exists and contains the item
        2. Send PLC retrieve command (e.g., "C2")
        3. If PLC succeeds → Update database to mark subcompartment as empty
        4. Return combined result
        
        Args:
            box_id: Box identifier (e.g., "C2")
            sub_id: Sub-compartment ID (e.g., "a")
            item_id: Item identifier that should be in this location
        
        Returns:
            {
                "success": bool,
                "box_id": str,
                "sub_id": str,
                "plc_status": "OK" | "ERROR",
                "plc_command": "C2",
                "message": str
            }
        """
        session = InventorySessionLocal()
        try:
            logger.info(f"retrieve_from_specific_location called: boxId={box_id}, subId={sub_id}, itemId={item_id}")
            
            # Convert item_id to int if possible to match schema type
            try:
                item_id_val = int(item_id)
            except (ValueError, TypeError):
                item_id_val = item_id

            # STEP 1: Validate that subcompartment exists and has the item
            subcom_place = f"{box_id}{sub_id}"
            query = text("""
                SELECT sc.compartment_id AS subcom_place, sc.item_id, sc.status
                FROM storage_compartments sc
                WHERE sc.compartment_id = :subcom_place
            """)
            
            result = session.execute(query, {
                "subcom_place": subcom_place
            }).fetchone()
            
            if not result:
                session.close()
                return {
                    "success": False,
                    "message": f"Subcompartment {subcom_place} not found"
                }
            
            current_subcom_place, actual_item_id, status = result
            
            # Check if occupied
            if status.lower() != 'occupied':
                session.close()
                return {
                    "success": False,
                    "message": f"Subcompartment {subcom_place} is not occupied (status: {status})"
                }
            
            # Verify the item matches
            if actual_item_id != item_id_val:
                session.close()
                return {
                    "success": False,
                    "message": f"Item mismatch: expected {item_id_val}, found {actual_item_id} in {subcom_place}"
                }
            
            # STEP 2: Send PLC retrieve command
            retrieve_command = box_id  # e.g., "C2"
            try:
                logger.info(f"Sending ASRS retrieve command: {retrieve_command}")
                plc_result = self.asrs_controller.run(retrieve_command)
                logger.info(f"ASRS command executed: {retrieve_command} -> {plc_result}")
                plc_status = "OK"
            except Exception as cmd_error:
                logger.error(f"PLC command failed: {cmd_error}")
                session.close()
                return {
                    "success": False,
                    "plc_status": "ERROR",
                    "plc_command": retrieve_command,
                    "message": f"PLC command failed: {str(cmd_error)}"
                }
            
            # STEP 3: Update database - mark as empty
            update_query = text("""
                UPDATE storage_compartments
                SET item_id = NULL,
                    status = 'empty'
                WHERE compartment_id = :subcom_place
            """)
            
            session.execute(update_query, {"subcom_place": subcom_place})
            session.commit()
            logger.info(f"Database updated: {subcom_place} marked as empty")
            
            session.close()
            
            return {
                "success": True,
                "box_id": box_id,
                "sub_id": sub_id,
                "subcom_place": subcom_place,
                "plc_status": plc_status,
                "plc_command": retrieve_command,
                "message": f"Successfully retrieved item from {subcom_place}"
            }
            
        except Exception as e:
            session.rollback()
            session.close()
            logger.error(f"Error in retrieve_from_specific_location: {e}")
            return {
                "success": False,
                "message": f"Error: {str(e)}"
            }

    # NOTE: update_subcompartment_after_retrieve() was removed — it was dead code
    # that called an undefined get_db() function. Use retrieve_from_specific_location() instead.

    def extract_box_id(self, subcom_place: str) -> str:
        """
        Extract box ID from subcompartment place code.
        Examples: "A11" -> "A1", "B23" -> "B2"
        """
        if len(subcom_place) < 2:
            raise ValueError(f"Invalid subcom_place format: {subcom_place}")
        return subcom_place[:2]

    def validate_box_id_format(self, box_id: str) -> bool:
        """Validate box ID format (e.g., A1, B3, C5). Valid rows: 1-7."""
        if not isinstance(box_id, str) or len(box_id) != 2:
            return False
        column = box_id[0]
        row = box_id[1]
        return column in "ABCDE" and row in "1234567"

    def validate_sub_id(self, sub_id: int) -> bool:
        """Validate sub-compartment ID (1-7)"""
        return isinstance(sub_id, int) and 1 <= sub_id <= 7
