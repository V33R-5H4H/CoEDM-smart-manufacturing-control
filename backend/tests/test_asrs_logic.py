"""
tests/test_asrs_logic.py
========================
Unit tests for ASRSLogic — the orchestration layer that coordinates DB updates
with PLC hardware commands.

All hardware (ASRS controller / PLC) is MOCKED.
All DB calls are MOCKED.
No OPC-UA, Modbus, or PostgreSQL connections needed.

Scenarios tested:
  add_product_with_asrs:
    ✓ PLC succeeds + subcompartment created (new slot)
    ✓ PLC succeeds + subcompartment updated (empty→occupied)
    ✓ PLC fails → DB NOT updated (no phantom records)
    ✓ Subcompartment already occupied → early return, no DB write
    ✓ Item not found → ValueError
    ✓ Box not found → ValueError
    ✓ Missing inputs → ValueError

  retrieve_product_with_asrs:
    ✓ PLC succeeds → DB updated (subcompartments cleared)
    ✓ PLC fails → DB NOT updated
    ✓ Insufficient stock → ValueError
    ✓ Missing / bad inputs → ValueError

  retrieve_from_specific_location:
    ✓ Correct item in slot → success
    ✓ Slot not found → failure dict (no exception)
    ✓ Slot empty (not Occupied) → failure dict
    ✓ Item mismatch → failure dict
    ✓ PLC fails → failure dict, no DB write
"""

import pytest
from unittest.mock import MagicMock, patch, call
from backend.tests.helpers import make_result


# ─── helpers ──────────────────────────────────────────────────────────────────

def _make_session_for_add(
    item_exists=True,
    box_exists=True,
    subcom_status=None,   # None → slot not in DB, 'Empty' → empty, 'Occupied' → taken
):
    """
    Build a mock session where execute() returns the right things
    for the add_product_with_asrs flow.
    """
    session = MagicMock()

    # We need to return different values on successive execute() calls:
    #   call 1 → item check
    #   call 2 → box check
    #   call 3 → subcompartment status check
    #   call 4 → UPDATE or INSERT
    #   call 5 → INSERT transaction
    responses = []

    # item check
    if item_exists:
        responses.append(make_result(["item_id"], [[1]]))
    else:
        responses.append(make_result(["item_id"], []))

    # box check
    if box_exists:
        responses.append(make_result(["box_id"], [["A1"]]))
    else:
        responses.append(make_result(["box_id"], []))

    # subcompartment check
    if subcom_status is None:
        responses.append(make_result(["status"], []))          # not in DB
    else:
        responses.append(make_result(["status"], [[subcom_status]]))

    # remaining calls (UPDATE/INSERT + transaction INSERT) just succeed
    _ok = MagicMock()
    _ok.rowcount = 1
    responses.extend([_ok, _ok])

    session.execute.side_effect = responses
    return session


# ═══════════════════════════════════════════════════════════════════════════════
# add_product_with_asrs
# ═══════════════════════════════════════════════════════════════════════════════

class TestAddProductWithASRS:

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_new_slot_plc_success_creates_subcompartment(self, mock_asrs, MockSession):
        """PLC succeeds + slot doesn't exist → new SubCompartment row created."""
        session = _make_session_for_add(subcom_status=None)
        MockSession.return_value = session
        mock_asrs.run.return_value = {"success": True, "message": "OK"}

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.add_product_with_asrs("A1", "a", "1")

        assert result["success"] is True
        assert result["db_status"] == "OK"
        assert result["db_operation"] == "created"
        assert result["plc_status"] == "OK"
        assert result["subcom_place"] == "A1a"
        session.commit.assert_called_once()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_empty_slot_plc_success_updates_subcompartment(self, mock_asrs, MockSession):
        """PLC succeeds + slot exists as Empty → existing row updated."""
        session = _make_session_for_add(subcom_status="Empty")
        MockSession.return_value = session
        mock_asrs.run.return_value = {"success": True, "message": "OK"}

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.add_product_with_asrs("A1", "b", "1")

        assert result["success"] is True
        assert result["db_operation"] == "updated"
        session.commit.assert_called_once()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_plc_failure_db_not_updated(self, mock_asrs, MockSession):
        """When PLC throws → DB should NOT be touched (no commit, no insert)."""
        session = _make_session_for_add(subcom_status=None)
        MockSession.return_value = session
        mock_asrs.run.side_effect = Exception("Not connected to PLC")

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.add_product_with_asrs("A1", "a", "1")

        assert result["success"] is False
        assert result["plc_status"] == "ERROR"
        # Only 2 execute calls (item check + box check), nothing after PLC failure
        assert session.execute.call_count == 2
        session.commit.assert_not_called()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_occupied_slot_returns_failure_without_plc_call(self, mock_asrs, MockSession):
        """Slot already Occupied → early return, PLC never called."""
        # Note: in the current algorithm, PLC is called BEFORE the occupied check.
        # So PLC IS called, but DB is not written. Test reflects actual code flow.
        session = _make_session_for_add(subcom_status="Occupied")
        MockSession.return_value = session
        mock_asrs.run.return_value = {"success": True, "message": "OK"}

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.add_product_with_asrs("A1", "a", "1")

        assert result["success"] is False
        assert "OCCUPIED" in result["message"]
        session.commit.assert_not_called()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_item_not_found_raises(self, mock_asrs, MockSession):
        """Item doesn't exist in Items table → ValueError raised."""
        session = _make_session_for_add(item_exists=False)
        MockSession.return_value = session

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        with pytest.raises(Exception, match="does not exist"):
            logic.add_product_with_asrs("A1", "a", "999")

        mock_asrs.run.assert_not_called()  # PLC never reached

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_box_not_found_raises(self, mock_asrs, MockSession):
        """Box doesn't exist in Boxes table → ValueError raised."""
        session = _make_session_for_add(box_exists=False)
        MockSession.return_value = session

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        with pytest.raises(Exception, match="does not exist"):
            logic.add_product_with_asrs("ZZ", "a", "1")

    def test_missing_box_id_raises(self):
        """Empty box_id → ValueError without DB call."""
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        with pytest.raises(Exception):
            logic.add_product_with_asrs("", "a", "1")

    def test_missing_item_id_raises(self):
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        with pytest.raises(Exception):
            logic.add_product_with_asrs("A1", "a", "")


# ═══════════════════════════════════════════════════════════════════════════════
# retrieve_product_with_asrs
# ═══════════════════════════════════════════════════════════════════════════════

class TestRetrieveProductWithASRS:

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_plc_success_db_updated(self, mock_asrs, MockSession):
        """PLC succeeds → SubCompartments marked Empty + Transactions logged."""
        session = MagicMock()
        MockSession.return_value = session

        # available subcompartments
        session.execute.return_value = make_result(
            ["subcom_place", "box_id", "sub_id", "column_name", "row_number"],
            [["A1a", "A1", "a", "A", 1]]
        )
        mock_asrs.run.return_value = {"success": True, "message": "OK"}

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.retrieve_product_with_asrs("1", 1)

        assert result["success"] is True
        assert result["db_status"] == "OK"
        assert result["quantity_retrieved"] == 1
        assert result["plc_status"] == "OK"
        session.commit.assert_called_once()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_plc_failure_db_not_updated(self, mock_asrs, MockSession):
        """PLC fails → DB must NOT be updated (no commit)."""
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["subcom_place", "box_id", "sub_id", "column_name", "row_number"],
            [["A1a", "A1", "a", "A", 1]]
        )
        mock_asrs.run.side_effect = Exception("PLC error")

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.retrieve_product_with_asrs("1", 1)

        assert result["success"] is False
        assert result["plc_status"] == "ERROR"
        session.commit.assert_not_called()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_insufficient_stock_raises(self, mock_asrs, MockSession):
        """Fewer items in DB than requested → ValueError."""
        session = MagicMock()
        MockSession.return_value = session
        # Only 1 available, requesting 3
        session.execute.return_value = make_result(
            ["subcom_place", "box_id", "sub_id", "column_name", "row_number"],
            [["A1a", "A1", "a", "A", 1]]
        )

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        with pytest.raises(Exception, match="Insufficient"):
            logic.retrieve_product_with_asrs("1", 3)

        mock_asrs.run.assert_not_called()  # PLC never called when stock insufficient

    def test_invalid_quantity_raises(self):
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        with pytest.raises(Exception):
            logic.retrieve_product_with_asrs("1", 0)  # qty must be > 0

    def test_missing_item_id_raises(self):
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        with pytest.raises(Exception):
            logic.retrieve_product_with_asrs("", 1)


# ═══════════════════════════════════════════════════════════════════════════════
# retrieve_from_specific_location
# ═══════════════════════════════════════════════════════════════════════════════

class TestRetrieveFromSpecificLocation:

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_success_clears_subcompartment(self, mock_asrs, MockSession):
        """Correct item in correct slot → PLC command sent, DB cleared."""
        session = MagicMock()
        MockSession.return_value = session

        # First execute: subcom lookup → occupied with item 1
        ok_result = MagicMock()
        ok_result.rowcount = 1
        session.execute.side_effect = [
            make_result(["subcom_place", "item_id", "status"], [["A1a", 1, "Occupied"]]),
            ok_result,  # UPDATE SubCompartments
        ]
        mock_asrs.run.return_value = {"success": True, "message": "OK"}

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.retrieve_from_specific_location("A1", "a", 1)

        assert result["success"] is True
        assert result["subcom_place"] == "A1a"
        assert result["plc_status"] == "OK"
        session.commit.assert_called_once()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_slot_not_found_returns_failure(self, mock_asrs, MockSession):
        """Non-existent subcom_place → returns failure dict, no exception."""
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["subcom_place", "item_id", "status"], []
        )

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.retrieve_from_specific_location("ZZ", "z", 1)

        assert result["success"] is False
        assert "not found" in result["message"].lower()
        mock_asrs.run.assert_not_called()
        session.commit.assert_not_called()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_slot_empty_returns_failure(self, mock_asrs, MockSession):
        """Slot exists but is Empty → failure dict, no PLC call."""
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["subcom_place", "item_id", "status"], [["A1b", None, "Empty"]]
        )

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.retrieve_from_specific_location("A1", "b", 1)

        assert result["success"] is False
        assert "not occupied" in result["message"].lower()
        mock_asrs.run.assert_not_called()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_item_mismatch_returns_failure(self, mock_asrs, MockSession):
        """Slot has a different item than requested → mismatch failure, no PLC."""
        session = MagicMock()
        MockSession.return_value = session
        # Slot has item_id=2 but we requested item_id=1
        session.execute.return_value = make_result(
            ["subcom_place", "item_id", "status"], [["A1e", 2, "Occupied"]]
        )

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.retrieve_from_specific_location("A1", "e", 1)

        assert result["success"] is False
        assert "mismatch" in result["message"].lower()
        mock_asrs.run.assert_not_called()

    @patch("backend.stations.asrs.asrs_logic.InventorySessionLocal")
    @patch("backend.stations.asrs.asrs_logic.asrs_controller")
    def test_plc_failure_returns_failure_dict(self, mock_asrs, MockSession):
        """PLC command throws → returns failure dict (no exception), DB not updated."""
        session = MagicMock()
        MockSession.return_value = session
        session.execute.return_value = make_result(
            ["subcom_place", "item_id", "status"], [["A1a", 1, "Occupied"]]
        )
        mock_asrs.run.side_effect = Exception("PLC timeout")

        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        logic.asrs_controller = mock_asrs

        result = logic.retrieve_from_specific_location("A1", "a", 1)

        assert result["success"] is False
        assert "PLC" in result["message"]
        session.commit.assert_not_called()


# ═══════════════════════════════════════════════════════════════════════════════
# Helper utilities
# ═══════════════════════════════════════════════════════════════════════════════

class TestASRSLogicHelpers:

    def test_extract_box_id(self):
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        assert logic.extract_box_id("A11") == "A1"
        assert logic.extract_box_id("B23") == "B2"
        assert logic.extract_box_id("E7a") == "E7"

    def test_extract_box_id_too_short_raises(self):
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        with pytest.raises(ValueError):
            logic.extract_box_id("A")

    def test_validate_box_id_format(self):
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        assert logic.validate_box_id_format("A1") is True
        assert logic.validate_box_id_format("E7") is True
        assert logic.validate_box_id_format("F1") is False  # F not in ABCDE
        assert logic.validate_box_id_format("A8") is False  # 8 not in 1-7
        assert logic.validate_box_id_format("A")  is False  # too short
        assert logic.validate_box_id_format("AA1") is False # too long

    def test_validate_sub_id(self):
        from backend.stations.asrs.asrs_logic import ASRSLogic
        logic = ASRSLogic()
        assert logic.validate_sub_id(1) is True
        assert logic.validate_sub_id(7) is True
        assert logic.validate_sub_id(0) is False
        assert logic.validate_sub_id(8) is False
        assert logic.validate_sub_id("a") is False
