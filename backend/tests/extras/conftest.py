"""
tests/conftest.py
=================
Shared pytest fixtures for the entire test suite.

Fixtures provided:
  mock_session        — mock SQLAlchemy Session (no real DB needed)
  mock_result         — factory for mock query result rows
  mock_asrs           — mock ASRSController (no PLC needed)
  mock_opcua          — mock OPCUAConnection (no OPC-UA server needed)
  test_client         — HTTPX sync test client for FastAPI routes
  async_test_client   — HTTPX async test client (for async route tests)
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

# Re-export helpers so conftest itself can be the single source
from backend.tests.helpers import (  # noqa: F401
    make_result, SAMPLE_BOX, SAMPLE_ITEM,
    SAMPLE_SUBCOMPARTMENT, SAMPLE_TRANSACTION, SAMPLE_ORDER,
)


# ── DB Session Fixture ────────────────────────────────────────────────────────

@pytest.fixture
def mock_session():
    """
    A mock SQLAlchemy session that records calls but never hits the database.
    Callers can configure return values per test with:
        mock_session.execute.return_value = make_result([...], [[...]])
    """
    session = MagicMock()
    session.commit.return_value = None
    session.rollback.return_value = None
    session.close.return_value = None
    session.flush.return_value = None
    return session


# ── PLC / ASRS Fixtures ───────────────────────────────────────────────────────

@pytest.fixture
def mock_asrs():
    """Mock ASRSController — simulates a connected PLC that accepts all commands."""
    ctrl = MagicMock()
    ctrl.run.return_value = {"success": True, "message": "Command executed", "command": "A1S"}
    ctrl.process_command.return_value = {"success": True, "message": "OK"}
    ctrl.is_connected.return_value = True
    ctrl.connected = True
    ctrl.disconnect.return_value = None
    return ctrl


@pytest.fixture
def mock_asrs_disconnected():
    """Mock ASRSController that simulates a disconnected / erroring PLC."""
    ctrl = MagicMock()
    ctrl.run.side_effect = Exception("Not connected to PLC")
    ctrl.process_command.side_effect = Exception("Not connected to PLC")
    ctrl.is_connected.return_value = False
    ctrl.connected = False
    return ctrl


# ── OPC-UA Fixture ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_opcua():
    """Mock OPCUAConnection — no real OPC-UA server required."""
    conn = MagicMock()
    conn.connected = False
    conn.connect.return_value = None
    conn.disconnect.return_value = None
    conn.set_node_state.return_value = None
    conn.pulse_node.return_value = None

    # Mock a node read
    mock_node = MagicMock()
    mock_node.get_value.return_value = 42.0
    conn.client = MagicMock()
    conn.client.get_node.return_value = mock_node
    return conn


# ── FastAPI Test Clients ──────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def test_app():
    """Import the FastAPI app once per session."""
    from backend.api.main import app
    return app


@pytest.fixture
def test_client(test_app):
    """Synchronous HTTPX test client (no server process needed)."""
    with TestClient(test_app, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
async def async_test_client(test_app):
    """Async HTTPX test client for testing async endpoints."""
    async with AsyncClient(
        transport=ASGITransport(app=test_app),
        base_url="http://test"
    ) as client:
        yield client


# ── Sample Data Constants ─────────────────────────────────────────────────────

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
