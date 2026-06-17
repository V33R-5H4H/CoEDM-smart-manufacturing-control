"""
tests/helpers.py
================
Pure helper functions and sample data constants shared across test modules.
No pytest dependency — importable from any test file.
"""

from unittest.mock import MagicMock


# ── Mock Row / Result Helpers ─────────────────────────────────────────────────

def make_result(columns: list, rows: list):
    """
    Build a mock SQLAlchemy CursorResult that supports:
      result.keys()       → column list
      result.fetchall()   → list of tuples
      result.fetchone()   → first tuple | None
      result.scalar()     → first value of first row | None
      result.rowcount     → number of rows
    """
    mock = MagicMock()
    mock.keys.return_value = columns
    tuples = [tuple(r) for r in rows]
    mock.fetchall.return_value = tuples
    mock.fetchone.return_value = tuples[0] if tuples else None
    mock.scalar.return_value = tuples[0][0] if tuples else None
    mock.rowcount = len(tuples)
    return mock


# ── Sample Data ───────────────────────────────────────────────────────────────

SAMPLE_BOX = {"box_id": "A1", "column_name": "A", "row_number": 1}

SAMPLE_ITEM = {
    "item_id": 1,
    "name": "Bearing",
    "description": "Steel ball bearing",
    "added_on": "2025-06-16 16:24:54",
}

SAMPLE_SUBCOMPARTMENT = {
    "subcom_place": "A1a",
    "box_id": "A1",
    "sub_id": "a",
    "item_id": 1,
    "status": "Occupied",
}

SAMPLE_TRANSACTION = {
    "tran_id": 1,
    "item_id": 1,
    "item_name": "Bearing",
    "subcom_place": "A1a",
    "action": "added",
    "time": "2026-01-12 10:51:24",
}

SAMPLE_ORDER = {
    "order_id": 4,
    "customer_name": "Test Customer",
    "customer_email": "test@example.com",
    "customer_phone": "123-456-7890",
    "shipping_address": "123 Test St",
    "total_amount": 29.99,
    "order_status": "pending",
    "created_at": "2025-08-26 02:58:07",
    "updated_at": "2025-08-26 02:58:07",
    "items_summary": "1x Bearing",
}
