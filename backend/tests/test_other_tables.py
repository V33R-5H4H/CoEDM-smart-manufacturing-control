"""
tests/test_other_tables.py
==========================
Unit tests for the new REST API routers targeting the remaining Integrated Schema v2 tables:
- machines & machine_sensors (/api/data/machines)
- users (/api/data/users)
- machine_events & machine_connections (/api/data/events)
- retrieval_queue (/api/asrs-data/queue)
- historical telemetry (/api/data/telemetry/{machine_id})

All database queries are mocked using pytest's mock session and cursor result helpers.
"""

import pytest
from unittest.mock import patch, MagicMock
import uuid
from datetime import datetime

from backend.tests.helpers import make_result


# ─── app client fixture ───────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """
    Test client with hardware connections mocked at module startup.
    Patches OPC-UA and Modbus so the app can import without live hardware.
    """
    with patch("backend.stations.asrs.asrs_station.OPCUAConnection"):
        with patch("backend.stations.assembly.hydraulic_station.OPCUAConnection"):
            with patch("backend.stations.mirac.cnc_mirac_station.OPCUAConnection"):
                with patch("backend.communication.modbus_driver.AsyncModbusTcpClient"):
                    from backend.api.main import app
                    from fastapi.testclient import TestClient
                    with TestClient(app, raise_server_exceptions=False) as c:
                        yield c


# ═══════════════════════════════════════════════════════════════════════════════
# Machines and Sensors Routes
# ═══════════════════════════════════════════════════════════════════════════════

class TestMachinesRoutes:

    @patch("backend.api.routes.data.machines.SessionLocal")
    def test_get_all_machines(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(
            ["machine_id", "name", "type", "description"],
            [
                ["assembly", "Assembly Station", "hydraulic", "Hydraulic press & assembly"],
                ["mirac", "MIRAC Lathe", "cnc", "CNC turning center"]
            ]
        )

        resp = client.get("/api/data/machines")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 2
        assert data["data"][0]["machine_id"] == "assembly"
        assert data["data"][1]["machine_id"] == "mirac"
        mock_session.close.assert_called_once()

    @patch("backend.api.routes.data.machines.SessionLocal")
    def test_get_machine_sensors_success(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.side_effect = [
            make_result(["machine_id"], [["assembly"]]),  # machine exists check
            make_result(
                ["sensor_id", "machine_id", "name", "type", "legacy_key"],
                [["sensor-uuid-1", "assembly", "Hydraulic Pressure", "pressure", "assembly"]]
            )  # sensors query
        ]

        resp = client.get("/api/data/machines/assembly/sensors")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert data["data"][0]["sensor_id"] == "sensor-uuid-1"
        assert data["data"][0]["legacy_key"] == "assembly"

    @patch("backend.api.routes.data.machines.SessionLocal")
    def test_get_machine_sensors_404_machine_not_found(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(["machine_id"], [])  # empty response implies 404

        resp = client.get("/api/data/machines/nonexistent/sensors")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# ═══════════════════════════════════════════════════════════════════════════════
# Users Routes
# ═══════════════════════════════════════════════════════════════════════════════

class TestUsersRoutes:

    @patch("backend.api.routes.data.users.SessionLocal")
    def test_get_all_users(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(
            ["user_id", "username", "email", "full_name", "role", "is_active", "created_at"],
            [["user-uuid-1", "admin", "admin@coedm.org", "Admin Operator", "admin", True, "2026-05-25 17:00:00"]]
        )

        resp = client.get("/api/data/users")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert data["data"][0]["username"] == "admin"

    @patch("backend.api.routes.data.users.SessionLocal")
    def test_create_user_success(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.side_effect = [
            make_result(["user_id"], []),  # email check -> not a duplicate
            make_result([], [])  # insert query
        ]

        payload = {
            "username": "operator1",
            "email": "op1@coedm.org",
            "full_name": "Machine Operator 1",
            "role": "operator"
        }

        resp = client.post("/api/data/users", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["username"] == "operator1"
        assert "user_id" in data["data"]
        mock_session.commit.assert_called_once()

    @patch("backend.api.routes.data.users.SessionLocal")
    def test_create_user_email_duplicate(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(["user_id"], [["existing-uuid"]])  # email already taken

        payload = {
            "username": "operator1",
            "email": "duplicate@coedm.org",
            "full_name": "Duplicate Operator",
            "role": "operator"
        }

        resp = client.post("/api/data/users", json=payload)
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"].lower()


# ═══════════════════════════════════════════════════════════════════════════════
# Events & Alarms Routes
# ═══════════════════════════════════════════════════════════════════════════════

class TestEventsRoutes:

    @patch("backend.api.routes.data.events.SessionLocal")
    def test_get_all_events(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(
            ["time", "machine_id", "sensor_id", "event_type", "severity", "title", "payload"],
            [["2026-05-25 17:00:00", "assembly", "sensor-uuid-1", "alarm", "critical", "Overpressure", None]]
        )

        resp = client.get("/api/data/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert data["data"][0]["title"] == "Overpressure"

    @patch("backend.api.routes.data.events.SessionLocal")
    def test_create_event_success(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.side_effect = [
            make_result(["machine_id"], [["assembly"]]),  # machine exists check
            make_result([], [])  # insert query
        ]

        payload = {
            "machine_id": "assembly",
            "sensor_id": str(uuid.uuid4()),
            "event_type": "alarm",
            "severity": "critical",
            "title": "E-stop Pressed",
            "payload": {"button_id": "ESTOP_MAIN"}
        }

        resp = client.post("/api/data/events", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["title"] == "E-stop Pressed"
        mock_session.commit.assert_called_once()

    @patch("backend.api.routes.data.events.SessionLocal")
    def test_create_event_machine_not_found(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(["machine_id"], [])  # machine doesn't exist

        payload = {
            "machine_id": "phantom_machine",
            "event_type": "info",
            "title": "Unrecognized Event"
        }

        resp = client.post("/api/data/events", json=payload)
        assert resp.status_code == 400
        assert "does not exist" in resp.json()["detail"].lower()

    @patch("backend.api.routes.data.events.SessionLocal")
    def test_get_connections(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(
            ["time", "sensor_id", "status", "connected_at", "disconnected_at"],
            [["2026-05-25 17:00:00", "sensor-uuid-1", "connected", "2026-05-25 17:00:00", None]]
        )

        resp = client.get("/api/data/events/connections")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert data["data"][0]["status"] == "connected"


# ═══════════════════════════════════════════════════════════════════════════════
# Retrieval Queue Routes
# ═══════════════════════════════════════════════════════════════════════════════

class TestQueueRoutes:

    @patch("backend.api.routes.data.asrs.queue.SessionLocal")
    def test_get_queue(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(
            ["item_id", "machine_id", "requested_by", "status", "priority", "enqueue_at"],
            [[1, "asrs", "user-uuid-1", "pending", 5, "2026-05-25 17:00:00"]]
        )

        resp = client.get("/api/asrs-data/queue")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert data["data"][0]["status"] == "pending"

    @patch("backend.api.routes.data.asrs.queue.SessionLocal")
    def test_push_to_queue_success(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.side_effect = [
            make_result(["item_id"], [[1]]),  # item exists check
            make_result(["user_id"], [["user-uuid-1"]]),  # user check
            make_result([], [])  # insert query
        ]

        payload = {
            "item_id": 1,
            "priority": 3
        }

        resp = client.post("/api/asrs-data/queue", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["item_id"] == 1
        assert data["data"]["priority"] == 3
        mock_session.commit.assert_called_once()

    @patch("backend.api.routes.data.asrs.queue.SessionLocal")
    def test_push_to_queue_item_not_found(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(["item_id"], [])  # item doesn't exist

        payload = {
            "item_id": 9999,
            "priority": 5
        }

        resp = client.post("/api/asrs-data/queue", json=payload)
        assert resp.status_code == 400
        assert "does not exist in master catalog" in resp.json()["detail"]


# ═══════════════════════════════════════════════════════════════════════════════
# Historical Telemetry Routes
# ═══════════════════════════════════════════════════════════════════════════════

class TestTelemetryRoutes:

    @patch("backend.api.routes.data.telemetry.SessionLocal")
    def test_get_machine_telemetry_assembly(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.side_effect = [
            make_result(["machine_id"], [["assembly"]]),  # machine check
            make_result(
                ["time", "bearing_operation_status", "shaft_operation_status", "led_red", "led_yellow", "led_green", "safety_curtain_status"],
                [["2026-05-25 17:00:00", True, False, False, False, True, False]]
            )  # telemetry query
        ]

        resp = client.get("/api/data/telemetry/assembly")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert data["data"][0]["bearing_operation_status"] is True

    @patch("backend.api.routes.data.telemetry.SessionLocal")
    def test_get_machine_telemetry_mirac(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.side_effect = [
            make_result(["machine_id"], [["mirac"]]),  # machine check
            make_result(
                ["time", "x_axis_value", "z_axis_value", "spindle_speed", "spindle_temperature", "spindle_vibration", "tool_temperature", "tool_vibration", "tool_number", "led_red", "led_yellow", "led_green", "safety_curtain_status"],
                [["2026-05-25 17:00:00", 10.0, 20.0, 1500.0, 45.0, 1.2, 38.0, 0.8, 1, False, False, True, False]]
            ),  # plc sensor data
            make_result(
                ["time", "sensor_id", "modbus_unit_id", "x_rms_acc", "y_rms_acc", "z_rms_acc", "x_peak_acc", "y_peak_acc", "z_peak_acc", "temperature", "rpm"],
                [["2026-05-25 17:00:00", "sensor-uuid-vib1", 1, 0.5, 0.5, 0.5, 1.0, 1.0, 1.0, 45.0, 1500.0]]
            ),  # vibit readings
            make_result(
                ["time", "average_voltage_ln", "average_voltage_ll", "average_current", "total_net_kwh"],
                [["2026-05-25 17:00:00", 230.0, 400.0, 1.5, 123.4]]
            )  # energy meter data
        ]

        resp = client.get("/api/data/telemetry/mirac")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["count"] == 1
        assert "plc" in data["data"]
        assert "vibit" in data["data"]
        assert "energy" in data["data"]
        assert data["data"]["plc"][0]["spindle_speed"] == 1500.0

    @patch("backend.api.routes.data.telemetry.SessionLocal")
    def test_get_machine_telemetry_not_found(self, mock_session_class, client):
        mock_session = MagicMock()
        mock_session_class.return_value = mock_session
        
        mock_session.execute.return_value = make_result(["machine_id"], [])  # machine exists check fails

        resp = client.get("/api/data/telemetry/ghost_machine")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
