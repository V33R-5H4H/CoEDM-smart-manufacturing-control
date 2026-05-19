"""
tests/test_controllers.py
==========================
Unit tests for all data controllers using a MOCKED database session.
No real PostgreSQL connection needed — all DB calls are intercepted.

Covers:
  - BoxController
  - ItemController
  - SubCompartmentController
  - TransactionController
  - OrderController (validation and query logic)
"""

import pytest
from unittest.mock import MagicMock, patch, call
from datetime import datetime

from backend.tests.helpers import make_result, SAMPLE_BOX, SAMPLE_ITEM, SAMPLE_SUBCOMPARTMENT, SAMPLE_TRANSACTION


# ═══════════════════════════════════════════════════════════════════════════════
# BOX CONTROLLER
# ═══════════════════════════════════════════════════════════════════════════════

class TestBoxController:

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_get_all_boxes_returns_list(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["box_id", "column_name", "row_number"]
        session.execute.return_value = make_result(cols, [["A1", "A", 1], ["B3", "B", 3]])

        from backend.stations.box_controller import BoxController
        result = BoxController.get_all_boxes()

        assert isinstance(result, list)
        assert len(result) == 2
        assert result[0]["box_id"] == "A1"
        assert result[1]["column_name"] == "B"
        session.close.assert_called_once()

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_get_all_boxes_empty(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(["box_id", "column_name", "row_number"], [])

        from backend.stations.box_controller import BoxController
        result = BoxController.get_all_boxes()

        assert result == []
        session.close.assert_called_once()

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_get_box_by_id_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["box_id", "column_name", "row_number"]
        session.execute.return_value = make_result(cols, [["A1", "A", 1]])

        from backend.stations.box_controller import BoxController
        result = BoxController.get_box_by_id("A1")

        assert result is not None
        assert result["box_id"] == "A1"
        session.close.assert_called_once()

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_get_box_by_id_not_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(["box_id", "column_name", "row_number"], [])

        from backend.stations.box_controller import BoxController
        result = BoxController.get_box_by_id("ZZ")

        assert result is None
        session.close.assert_called_once()

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_create_box_success(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session

        from backend.stations.box_controller import BoxController
        result = BoxController.create_box("F1", "F", 1)

        assert result["box_id"] == "F1"
        session.commit.assert_called_once()
        session.close.assert_called_once()

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_create_box_missing_fields_raises(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session

        from backend.stations.box_controller import BoxController
        with pytest.raises(ValueError):
            BoxController.create_box("", "A", 1)  # empty box_id

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_delete_box_success(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        mock_result = MagicMock()
        mock_result.rowcount = 1
        session.execute.return_value = mock_result

        from backend.stations.box_controller import BoxController
        result = BoxController.delete_box("A1")

        assert result["success"] is True
        assert result["affectedRows"] == 1
        session.commit.assert_called_once()

    @patch("backend.stations.box_controller.InventorySessionLocal")
    def test_delete_box_not_found_raises(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        mock_result = MagicMock()
        mock_result.rowcount = 0
        session.execute.return_value = mock_result

        from backend.stations.box_controller import BoxController
        with pytest.raises(Exception, match="not found"):
            BoxController.delete_box("ZZ")


# ═══════════════════════════════════════════════════════════════════════════════
# ITEM CONTROLLER
# ═══════════════════════════════════════════════════════════════════════════════

class TestItemController:

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_get_all_items(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["item_id", "name", "description", "added_on"]
        session.execute.return_value = make_result(
            cols,
            [[1, "Bearing", "Steel ball bearing", "2025-06-16"],
             [2, "Gear", "24T spur gear", "2025-06-16"]]
        )

        from backend.stations.item_controller import ItemController
        result = ItemController.get_all_items()

        assert len(result) == 2
        assert result[0]["name"] == "Bearing"
        assert result[1]["item_id"] == 2
        session.close.assert_called_once()

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_get_item_by_id_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["item_id", "name", "description", "added_on"]
        session.execute.return_value = make_result(cols, [[1, "Bearing", "Desc", "2025-06-16"]])

        from backend.stations.item_controller import ItemController
        result = ItemController.get_item_by_id(1)

        assert result["item_id"] == 1
        assert result["name"] == "Bearing"

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_get_item_by_id_not_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(["item_id", "name", "description", "added_on"], [])

        from backend.stations.item_controller import ItemController
        result = ItemController.get_item_by_id(999)

        assert result is None

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_check_item_exists_true(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        mock_result = MagicMock()
        mock_result.scalar.return_value = 1
        session.execute.return_value = mock_result

        from backend.stations.item_controller import ItemController
        assert ItemController.check_item_id_exists(1) is True

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_check_item_exists_false(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        mock_result = MagicMock()
        mock_result.scalar.return_value = 0
        session.execute.return_value = mock_result

        from backend.stations.item_controller import ItemController
        assert ItemController.check_item_id_exists(999) is False

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_create_item_missing_name_raises(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session

        from backend.stations.item_controller import ItemController
        with pytest.raises(ValueError, match="item_id and name"):
            ItemController.create_item(10, "", "desc")

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_create_item_missing_id_raises(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session

        from backend.stations.item_controller import ItemController
        with pytest.raises(ValueError):
            ItemController.create_item(None, "Name", "desc")

    @patch("backend.stations.item_controller.InventorySessionLocal")
    def test_get_available_items_with_count(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["item_id", "name", "available_count"],
            [[1, "Bearing", 27], [2, "Gear", 15]]
        )

        from backend.stations.item_controller import ItemController
        result = ItemController.get_available_items_with_count()

        assert len(result) == 2
        assert result[0]["available_count"] == 27


# ═══════════════════════════════════════════════════════════════════════════════
# SUBCOMPARTMENT CONTROLLER
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubCompartmentController:

    @patch("backend.stations.subcompartment_controller.InventorySessionLocal")
    def test_get_all_subcompartments(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["subcom_place", "box_id", "sub_id", "item_id", "status"]
        session.execute.return_value = make_result(
            cols,
            [["A1a", "A1", "a", 1, "Occupied"],
             ["A1b", "A1", "b", None, "Empty"]]
        )

        from backend.stations.subcompartment_controller import SubCompartmentController
        result = SubCompartmentController.get_all_subcompartments()

        assert len(result) == 2
        assert result[0]["subcom_place"] == "A1a"
        assert result[0]["status"] == "Occupied"
        assert result[1]["item_id"] is None

    @patch("backend.stations.subcompartment_controller.InventorySessionLocal")
    def test_get_subcompartment_by_place_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["subcom_place", "box_id", "sub_id", "item_id", "status"]
        session.execute.return_value = make_result(cols, [["A1a", "A1", "a", 1, "Occupied"]])

        from backend.stations.subcompartment_controller import SubCompartmentController
        result = SubCompartmentController.get_subcompartment_by_place("A1a")

        assert result["subcom_place"] == "A1a"
        assert result["status"] == "Occupied"

    @patch("backend.stations.subcompartment_controller.InventorySessionLocal")
    def test_get_subcompartment_not_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["subcom_place", "box_id", "sub_id", "item_id", "status"], []
        )

        from backend.stations.subcompartment_controller import SubCompartmentController
        result = SubCompartmentController.get_subcompartment_by_place("ZZZ")

        assert result is None

    def test_create_subcompartment_occupied_without_item_raises(self):
        """Business rule: Occupied status requires an item_id."""
        from backend.stations.subcompartment_controller import SubCompartmentController
        with pytest.raises(ValueError, match="Item ID is required"):
            SubCompartmentController.create_subcompartment(
                "A1z", "A1", "z", item_id=None, status="Occupied"
            )

    @patch("backend.stations.subcompartment_controller.InventorySessionLocal")
    def test_create_subcompartment_empty_no_item_ok(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session

        from backend.stations.subcompartment_controller import SubCompartmentController
        result = SubCompartmentController.create_subcompartment(
            "A1z", "A1", "z", item_id=None, status="Empty"
        )

        assert result["subcom_place"] == "A1z"
        assert result["status"] == "Empty"
        session.commit.assert_called_once()

    @patch("backend.stations.subcompartment_controller.InventorySessionLocal")
    def test_update_status_success(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        mock_result = MagicMock()
        mock_result.rowcount = 1
        session.execute.return_value = mock_result

        from backend.stations.subcompartment_controller import SubCompartmentController
        result = SubCompartmentController.update_status("A1a", "Empty", None)

        assert result["subcom_place"] == "A1a"
        assert result["status"] == "Empty"
        session.commit.assert_called_once()

    @patch("backend.stations.subcompartment_controller.InventorySessionLocal")
    def test_update_status_not_found_raises(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        mock_result = MagicMock()
        mock_result.rowcount = 0
        session.execute.return_value = mock_result

        from backend.stations.subcompartment_controller import SubCompartmentController
        with pytest.raises(Exception, match="not found"):
            SubCompartmentController.update_status("ZZZ", "Empty", None)


# ═══════════════════════════════════════════════════════════════════════════════
# TRANSACTION CONTROLLER
# ═══════════════════════════════════════════════════════════════════════════════

class TestTransactionController:

    @patch("backend.stations.transaction_controller.InventorySessionLocal")
    def test_get_all_transactions_default_sort(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["tran_id", "item_id", "item_name", "subcom_place", "action", "time"]
        session.execute.return_value = make_result(
            cols,
            [[1, 1, "Bearing", "A1a", "added", "2026-01-12"],
             [2, 2, "Gear",    "A7a", "added", "2026-01-12"]]
        )

        from backend.stations.transaction_controller import TransactionController
        result = TransactionController.get_all_transactions(sort="id_asc", limit=100)

        assert len(result) == 2
        assert result[0]["action"] == "added"
        assert result[0]["item_name"] == "Bearing"

    @patch("backend.stations.transaction_controller.InventorySessionLocal")
    def test_get_transaction_by_id_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["tran_id", "item_id", "item_name", "subcom_place", "action", "time"]
        session.execute.return_value = make_result(cols, [[5, 1, "Bearing", "A1a", "added", "2026-01-12"]])

        from backend.stations.transaction_controller import TransactionController
        result = TransactionController.get_transaction_by_id(5)

        assert result["tran_id"] == 5
        assert result["item_name"] == "Bearing"

    @patch("backend.stations.transaction_controller.InventorySessionLocal")
    def test_get_transaction_by_id_not_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["tran_id", "item_id", "item_name", "subcom_place", "action", "time"], []
        )

        from backend.stations.transaction_controller import TransactionController
        result = TransactionController.get_transaction_by_id(9999)

        assert result is None

    @patch("backend.stations.transaction_controller.InventorySessionLocal")
    def test_create_transaction_success(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        mock_result = MagicMock()
        mock_result.fetchone.return_value = (42,)
        session.execute.return_value = mock_result

        from backend.stations.transaction_controller import TransactionController
        result = TransactionController.create_transaction({
            "item_id": 1,
            "action": "added",
            "subcom_place": "A1a",
        })

        assert result["tran_id"] == 42
        assert result["action"] == "added"
        session.commit.assert_called_once()

    def test_create_transaction_missing_fields_raises(self):
        """item_id and action are required."""
        from backend.stations.transaction_controller import TransactionController
        with pytest.raises(ValueError):
            TransactionController.create_transaction({"item_id": 1})  # no action

    @patch("backend.stations.transaction_controller.InventorySessionLocal")
    def test_get_transactions_by_item_id(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["tran_id", "item_id", "item_name", "subcom_place", "action", "time"]
        session.execute.return_value = make_result(
            cols,
            [[1, 1, "Bearing", "A1a", "added",     "2026-01-12"],
             [2, 1, "Bearing", "A1a", "retrieved",  "2026-01-13"]]
        )

        from backend.stations.transaction_controller import TransactionController
        result = TransactionController.get_transactions_by_item_id(1)

        assert len(result) == 2
        assert all(r["item_id"] == 1 for r in result)


# ═══════════════════════════════════════════════════════════════════════════════
# ORDER CONTROLLER
# ═══════════════════════════════════════════════════════════════════════════════

class TestOrderController:

    def test_valid_statuses_defined(self):
        from backend.stations.order_controller import OrderController
        assert "pending" in OrderController.VALID_STATUSES
        assert "cancelled" in OrderController.VALID_STATUSES
        assert len(OrderController.VALID_STATUSES) == 5

    def test_update_status_invalid_raises(self):
        from backend.stations.order_controller import OrderController
        with pytest.raises(ValueError, match="Invalid status"):
            OrderController.update_order_status(1, "banana")

    def test_get_orders_by_status_invalid_raises(self):
        from backend.stations.order_controller import OrderController
        with pytest.raises(ValueError, match="Invalid status"):
            OrderController.get_orders_by_status("flying")

    @patch("backend.stations.order_controller.InventorySessionLocal")
    def test_get_all_orders(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        cols = ["order_id", "customer_name", "total_amount", "order_status", "items_summary"]
        session.execute.return_value = make_result(
            cols,
            [[4, "Test Customer", 29.99, "pending", "1x Bearing"],
             [5, "Devisha",        23.00, "pending", "1x Bolt Set"]]
        )

        from backend.stations.order_controller import OrderController
        result = OrderController.get_all_orders()

        assert len(result) == 2
        assert result[0]["customer_name"] == "Test Customer"

    @patch("backend.stations.order_controller.InventorySessionLocal")
    def test_get_order_by_id_not_found(self, MockSession):
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["order_id", "customer_name", "total_amount"], []
        )

        from backend.stations.order_controller import OrderController
        result = OrderController.get_order_by_id(9999)

        assert result is None

    def test_create_order_missing_customer_name_raises(self):
        from backend.stations.order_controller import OrderController
        with pytest.raises(Exception, match="Missing required field"):
            OrderController.create_order({
                "customer_email": "x@x.com",
                "customer_phone": "123",
                "shipping_address": "Street",
                "items": [{"item_id": 1, "quantity": 1, "price": 10}],
            })

    def test_create_order_no_items_raises(self):
        from backend.stations.order_controller import OrderController
        with pytest.raises(Exception, match="items"):
            OrderController.create_order({
                "customer_name": "Test",
                "customer_email": "x@x.com",
                "customer_phone": "123",
                "shipping_address": "Street",
                "items": [],
            })

    def test_create_order_invalid_item_quantity_raises(self):
        from backend.stations.order_controller import OrderController
        with pytest.raises(Exception):
            OrderController.create_order({
                "customer_name": "Test",
                "customer_email": "x@x.com",
                "customer_phone": "123",
                "shipping_address": "Street",
                "items": [{"item_id": 1, "quantity": 0, "price": 10}],  # qty=0 invalid
            })
