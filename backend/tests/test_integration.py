"""
tests/test_integration.py
==========================
Integration tests that run against the REAL PostgreSQL database.
Requires a live DB connection (the same coedm_db used in production).

These tests READ data from the DB (SELECT only) to verify the full stack
from HTTP request → FastAPI router → controller → SQLAlchemy → PostgreSQL.

No hardware (OPC-UA / PLC) is needed — only DB.
No data is modified (read-only queries).

Skip automatically if DB is unavailable:
    pytest -m integration
    pytest -k "not integration"   # skip these tests
"""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


def _db_available() -> bool:
    """Return True if we can reach the test database."""
    try:
        from backend.database.db import verify_db
        return verify_db()["ok"]
    except Exception:
        return False


# Skip the entire module if DB is not reachable
pytestmark = pytest.mark.skipif(
    not _db_available(),
    reason="PostgreSQL database not available"
)


@pytest.fixture(scope="module")
def live_client():
    """TestClient connected to a fully-booted FastAPI app with real DB."""
    with patch("backend.stations.asrs.asrs_station.OPCUAConnection"):
        with patch("backend.stations.assembly.hydraulic_station.OPCUAConnection"):
            with patch("backend.stations.mirac.cnc_mirac_station.OPCUAConnection"):
                with patch("backend.communication.modbus_driver.AsyncModbusTcpClient"):
                    from backend.api.main import app
                    with TestClient(app, raise_server_exceptions=True) as c:
                        yield c


# ═══════════════════════════════════════════════════════════════════════════════
# Health
# ═══════════════════════════════════════════════════════════════════════════════

class TestHealthLive:

    def test_health_db_ok(self, live_client):
        resp = live_client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        db = data.get("database", {})
        assert db.get("connected") is True or db.get("ok") is True, (
            f"DB health check failed: {db}"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# Boxes (live DB)
# ═══════════════════════════════════════════════════════════════════════════════

class TestBoxesLive:

    def test_get_all_boxes_returns_35(self, live_client):
        """The DB has exactly 35 boxes (A1-A7, B1-B7, …, E1-E7)."""
        resp = live_client.get("/api/asrs-data/boxes")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        # Accept ≥35 (allows for test data additions)
        assert data["count"] >= 35, f"Expected ≥35 boxes, got {data['count']}"

    def test_get_box_a1_exists(self, live_client):
        resp = live_client.get("/api/asrs-data/boxes/A1")
        assert resp.status_code == 200
        box = resp.json()["data"]
        assert box["box_id"] == "A1"
        assert box["column_name"] == "A"
        assert box["row_number"] == 1

    def test_get_nonexistent_box_404(self, live_client):
        resp = live_client.get("/api/asrs-data/boxes/ZZ")
        assert resp.status_code == 404

    def test_boxes_with_empty_compartments(self, live_client):
        resp = live_client.get("/api/asrs-data/boxes/empty-compartments")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert isinstance(data["data"], list)


# ═══════════════════════════════════════════════════════════════════════════════
# Items (live DB)
# ═══════════════════════════════════════════════════════════════════════════════

class TestItemsLive:

    def test_get_all_items_returns_3(self, live_client):
        """Seed data has exactly 3 items: Bearing, Gear, Bolt Set."""
        resp = live_client.get("/api/asrs-data/items")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] >= 3
        names = [i["name"] for i in data["data"]]
        assert "Bearing" in names
        assert "Gear" in names

    def test_get_item_1_bearing(self, live_client):
        resp = live_client.get("/api/asrs-data/items/1")
        assert resp.status_code == 200
        item = resp.json()["data"]
        assert item["name"] == "Bearing"
        assert item["item_id"] == 1

    def test_get_nonexistent_item_404(self, live_client):
        resp = live_client.get("/api/asrs-data/items/9999")
        assert resp.status_code == 404

    def test_item_1_exists(self, live_client):
        resp = live_client.get("/api/asrs-data/items/1/exists")
        assert resp.status_code == 200
        assert resp.json()["exists"] is True

    def test_item_9999_not_exists(self, live_client):
        resp = live_client.get("/api/asrs-data/items/9999/exists")
        assert resp.status_code == 200
        assert resp.json()["exists"] is False

    def test_available_items_with_count(self, live_client):
        resp = live_client.get("/api/asrs-data/items/available/with-count")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        # At least Bearing and Gear are occupied
        names = [i["name"] for i in data["data"]]
        assert "Bearing" in names

    def test_item_locations(self, live_client):
        """Item 1 (Bearing) has known locations in the seed data."""
        resp = live_client.get("/api/asrs-data/items/1/locations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] > 0


# ═══════════════════════════════════════════════════════════════════════════════
# SubCompartments (live DB)
# ═══════════════════════════════════════════════════════════════════════════════

class TestSubCompartmentsLive:

    def test_get_all_returns_66(self, live_client):
        """Seed data has 66 subcompartments."""
        resp = live_client.get("/api/asrs-data/subcompartments")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] >= 66

    def test_get_a1a_occupied(self, live_client):
        """A1a is Occupied with item 1 (Bearing) in seed data."""
        resp = live_client.get("/api/asrs-data/subcompartments/A1a")
        assert resp.status_code == 200
        sc = resp.json()["data"]
        assert sc["subcom_place"] == "A1a"
        assert sc["status"] == "Occupied"
        assert sc["item_id"] == 1

    def test_get_nonexistent_subcompartment_404(self, live_client):
        resp = live_client.get("/api/asrs-data/subcompartments/ZZZ")
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Transactions (live DB)
# ═══════════════════════════════════════════════════════════════════════════════

class TestTransactionsLive:

    def test_get_all_transactions(self, live_client):
        resp = live_client.get("/api/asrs-data/transactions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] >= 100  # seed has 102

    def test_get_transaction_1(self, live_client):
        resp = live_client.get("/api/asrs-data/transactions/1")
        assert resp.status_code == 200
        tx = resp.json()["data"]
        assert tx["tran_id"] == 1
        assert tx["action"] == "added"
        assert tx["item_name"] == "Bearing"

    def test_get_transactions_for_item_1(self, live_client):
        resp = live_client.get("/api/asrs-data/transactions/item/1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] > 0
        assert all(t["item_id"] == 1 for t in data["data"])

    def test_sort_newest_first(self, live_client):
        resp = live_client.get("/api/asrs-data/transactions?sort=newest_first&limit=5")
        assert resp.status_code == 200

    def test_sort_added_only(self, live_client):
        resp = live_client.get("/api/asrs-data/transactions?sort=added_only")
        assert resp.status_code == 200
        data = resp.json()
        assert all(t["action"] == "added" for t in data["data"])


# ═══════════════════════════════════════════════════════════════════════════════
# Orders (live DB)
# ═══════════════════════════════════════════════════════════════════════════════

class TestOrdersLive:

    def test_get_all_orders(self, live_client):
        resp = live_client.get("/api/asrs-data/orders")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] >= 13  # seed has 13 orders

    def test_get_order_4(self, live_client):
        resp = live_client.get("/api/asrs-data/orders/4")
        assert resp.status_code == 200
        order = resp.json()["data"]
        assert order["order_id"] == 4

    def test_get_nonexistent_order_404(self, live_client):
        resp = live_client.get("/api/asrs-data/orders/99999")
        assert resp.status_code == 404

    def test_order_stats(self, live_client):
        resp = live_client.get("/api/asrs-data/orders/stats/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        stats = data["data"]
        assert "total_orders" in stats
        assert stats["total_orders"] >= 13

    def test_orders_by_status_pending(self, live_client):
        resp = live_client.get("/api/asrs-data/orders/status/pending")
        assert resp.status_code == 200

    def test_orders_by_status_invalid_400(self, live_client):
        resp = live_client.get("/api/asrs-data/orders/status/banana")
        assert resp.status_code == 400
