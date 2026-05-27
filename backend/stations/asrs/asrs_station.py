"""
ASRS Controller — simplified, robust version.

Key design choices:
- NO contract discovery.  Command nodes are accessed directly by tag name.
- ONE LED subscription at a time, guarded by a threading lock.
- connect() is synchronous: connect → subscribe in one call.
- disconnect() always cleans up subscription before dropping the session.
"""

from backend.communication.opcua_driver import OPCUAConnection
from backend.stations.asrs.shuttle import ShuttleState
from backend.stations.asrs.led_service import LEDService
from backend.stations.asrs.led_handler import LEDHandler
from backend.config import settings
import logging
from threading import Lock
from backend.database.db import SessionLocal
from sqlalchemy import text
from backend.core.timezone import ist_now
from datetime import timedelta
import json

# Grid constants
LETTERS = ["A", "B", "C", "D", "E"]
NUMBERS = range(1, 8)
PLC_NAMESPACE = settings.ASRS_OPCUA_NS

# Single shared connection — URL from settings
asrs_connection = OPCUAConnection(settings.ASRS_OPCUA_URL)

_asrs_sensor_id_cached = None

def _get_asrs_sensor_id() -> str:
    global _asrs_sensor_id_cached
    if _asrs_sensor_id_cached:
        return _asrs_sensor_id_cached
    session = SessionLocal()
    try:
        row = session.execute(
            text("SELECT sensor_id FROM machine_sensors WHERE legacy_key = 'asrs'")
        ).fetchone()
        if row:
            _asrs_sensor_id_cached = str(row[0])
            return _asrs_sensor_id_cached
    except Exception as e:
        logging.error(f"[ASRS DB] Error fetching sensor_id: {e}")
    finally:
        session.close()
    return None

def _log_asrs_connection(connected: bool, reason: str = None):
    sensor_id = _get_asrs_sensor_id()
    if not sensor_id:
        return
    session = SessionLocal()
    try:
        now = ist_now()
        if connected:
            session.execute(
                text("""
                    INSERT INTO machine_connections (sensor_id, connected_at, disconnected_at, disconnect_reason, simulated)
                    VALUES (:sensor_id, :connected_at, NULL, NULL, False)
                """),
                {"sensor_id": sensor_id, "connected_at": now}
            )
        else:
            latest = session.execute(
                text("""
                    SELECT id FROM machine_connections 
                    WHERE sensor_id = :sensor_id AND disconnected_at IS NULL 
                    ORDER BY connected_at DESC LIMIT 1
                """),
                {"sensor_id": sensor_id}
            ).fetchone()
            
            if latest:
                session.execute(
                    text("""
                        UPDATE machine_connections 
                        SET disconnected_at = :disconnected_at, disconnect_reason = :reason
                        WHERE id = :id
                    """),
                    {"disconnected_at": now, "reason": reason or "Client request / shutdown", "id": latest[0]}
                )
            else:
                session.execute(
                    text("""
                        INSERT INTO machine_connections (sensor_id, connected_at, disconnected_at, disconnect_reason, simulated)
                        VALUES (:sensor_id, :connected_at, :disconnected_at, :reason, False)
                    """),
                    {"sensor_id": sensor_id, "connected_at": now - timedelta(minutes=1), "disconnected_at": now, "reason": reason or "Disconnected"}
                )
        session.commit()
    except Exception as e:
        logging.error(f"[ASRS DB] Error logging connection: {e}")
        session.rollback()
    finally:
        session.close()

def _log_asrs_event(event_type: str, severity: str, title: str, payload_data: dict = None):
    sensor_id = _get_asrs_sensor_id()
    if not sensor_id:
        return
    session = SessionLocal()
    try:
        session.execute(
            text("""
                INSERT INTO machine_events (time, machine_id, sensor_id, event_type, severity, title, payload)
                VALUES (:time, 'asrs', :sensor_id, :event_type, :severity, :title, :payload)
            """),
            {
                "time": ist_now(),
                "sensor_id": sensor_id,
                "event_type": event_type,
                "severity": severity,
                "title": title,
                "payload": json.dumps(payload_data) if payload_data else None
            }
        )
        session.commit()
    except Exception as e:
        logging.error(f"[ASRS DB] Error logging event: {e}")
        session.rollback()
    finally:
        session.close()


class ASRSController:
    """
    Sends store/retrieve commands to the PLC and monitors LED feedback.
    """

    def __init__(self):
        self.shuttle = ShuttleState()
        self.led_service = LEDService()

        # Subscription state (guarded by _sub_lock)
        self._sub_lock = Lock()
        self._led_subscription = None

        # Register for auto-reconnect
        asrs_connection.register_reconnect_callback(self._on_reconnect)

        # Register callback for automatic shuttle tracking based on LED edge transitions
        self.led_service.register_callback(self._on_led_state_change)

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def connect(self):
        """Connect to PLC and start LED monitoring."""
        logging.info("[ASRS] connect() called")
        try:
            asrs_connection.connect()
            self._subscribe_to_leds()
            logging.info("[ASRS] Connected and LED subscription active.")
            _log_asrs_connection(True)
            _log_asrs_event("info", "info", "ASRS OPC-UA Session Connected")
        except Exception as e:
            logging.error(f"[ASRS] Connection failed: {e}")
            _log_asrs_event("alarm", "critical", f"ASRS Connection Attempt Failed: {e}")
            raise

    def disconnect(self):
        """Stop LED monitoring and disconnect from PLC."""
        logging.info("[ASRS] disconnect() called")
        self._unsubscribe_leds()
        asrs_connection.disconnect()
        logging.info("[ASRS] Disconnected.")
        _log_asrs_connection(False, "User disconnect request")
        _log_asrs_event("info", "info", "ASRS OPC-UA Session Disconnected")

    def is_connected(self) -> bool:
        return asrs_connection.connected

    # ------------------------------------------------------------------
    # Command execution
    # ------------------------------------------------------------------

    def run(self, command: str) -> dict:
        """
        Execute a store / retrieve / home command.

        Command format:
          Store:    "<Col><Row>S"  e.g.  "A1S"
          Retrieve: "<Col><Row>"   e.g.  "A1"
          Home:     "Home"
        """
        cmd = command.upper().strip()
        logging.info(f"[ASRS] run({cmd})")

        if not asrs_connection.connected:
            raise Exception("Not connected to PLC")

        # Determine operation type
        if cmd == "HOME":
            operation = "HOME"
            pulse_tag = "Home"
        elif cmd.endswith("S"):
            operation = "STORE"
            pulse_tag = cmd
        else:
            operation = "RETRIEVE"
            pulse_tag = cmd

        # Update shuttle position BEFORE pulsing (so frontend sees "moving" immediately)
        if cmd != "HOME":
            target = cmd.rstrip("S")
            col = target[0]
            row = int(target[1])
            self.shuttle.set_moving(col, row, cmd)

        # Pulse the PLC node
        logging.info(f"[ASRS] Pulsing node '{pulse_tag}'")
        asrs_connection.pulse_node(pulse_tag)
        logging.info(f"[ASRS] {operation} command '{cmd}' executed successfully.")
        _log_asrs_event("info", "info", f"ASRS {operation} Issued: {cmd}", {"box_id": cmd.rstrip("S"), "command": cmd, "operation": operation})

        return {
            "success": True,
            "command": cmd,
            "operation": operation,
            "message": f"ASRS {operation} command executed successfully.",
        }

    # Compatibility alias used by some routers
    def process_command(self, command: str) -> dict:
        return self.run(command)

    # ------------------------------------------------------------------
    # Shuttle helpers
    # ------------------------------------------------------------------

    def get_shuttle_state(self) -> dict:
        return self.shuttle.snapshot()

    # ------------------------------------------------------------------
    # LED subscription (guarded — only one at a time)
    # ------------------------------------------------------------------

    def _subscribe_to_leds(self):
        """Create OPC UA subscription for all 35 LED nodes.
        Safe to call multiple times — old subscription is cleaned up first."""
        with self._sub_lock:
            # Clean up any previous subscription
            self._cleanup_subscription()

            if not asrs_connection.connected or not asrs_connection.client:
                logging.warning("[ASRS] Cannot subscribe — not connected.")
                return

            try:
                logging.info("[ASRS] Subscribing to LED nodes...")
                led_nodes = []
                node_to_tag = {}

                for letter in LETTERS:
                    for number in NUMBERS:
                        tag = f"led{letter}{number}"
                        node_id = f"ns={PLC_NAMESPACE};s={tag}"
                        try:
                            node = asrs_connection.client.get_node(node_id)
                            value = node.get_value()
                            led_nodes.append(node)
                            node_to_tag[node.nodeid.to_string()] = tag

                            # Seed the LED service with current state (no callback fired)
                            box_id = tag.replace("led", "")
                            self.led_service.led_state[box_id] = bool(value)
                            self.led_service.prev_led_state[box_id] = bool(value)
                        except Exception as e:
                            logging.warning(f"[ASRS] LED {tag} unavailable: {e}")

                # Also subscribe to the native ASRS safety curtain node
                safety_tag = "saftey"
                safety_node_id = f"ns={PLC_NAMESPACE};s={safety_tag}"
                try:
                    safety_node = asrs_connection.client.get_node(safety_node_id)
                    safety_value = safety_node.get_value()
                    led_nodes.append(safety_node)
                    node_to_tag[safety_node.nodeid.to_string()] = safety_tag

                    # Seed the LED service with initial safety state (invert: True=Safe, False=Broken)
                    is_interrupted = not bool(safety_value)
                    self.led_service.safety_curtain = is_interrupted
                    self.led_service.prev_safety_curtain = is_interrupted
                    logging.info(f"[ASRS] Subscribed to safety node with initial value: {safety_value} (Interrupted={is_interrupted})")
                except Exception as e:
                    logging.warning(f"[ASRS] Safety tag '{safety_tag}' unavailable: {e}")

                if not led_nodes:
                    logging.error("[ASRS] No LED nodes found!")
                    return

                handler = LEDHandler(self.led_service, node_to_tag)
                self._led_subscription = asrs_connection.client.create_subscription(
                    100, handler
                )
                handles = self._led_subscription.subscribe_data_change(led_nodes)
                logging.info(
                    f"[ASRS] LED subscription active — {len(handles)} nodes monitored."
                )
            except Exception as e:
                logging.error(f"[ASRS] LED subscription failed: {e}")
                self._led_subscription = None

    def _unsubscribe_leds(self):
        """Safely tear down the current LED subscription."""
        with self._sub_lock:
            self._cleanup_subscription()

    def _cleanup_subscription(self):
        """Internal: delete subscription object if it exists (must hold _sub_lock)."""
        if self._led_subscription:
            try:
                self._led_subscription.delete()
                logging.info("[ASRS] Old LED subscription deleted.")
            except Exception as e:
                logging.warning(f"[ASRS] Subscription cleanup warning: {e}")
            self._led_subscription = None

    def _on_reconnect(self):
        """Called by OPCUAConnection after a successful auto-reconnect."""
        logging.info("[ASRS] Auto-reconnect detected — re-subscribing to LEDs.")
        self._subscribe_to_leds()
        _log_asrs_connection(True)
        _log_asrs_event("info", "info", "ASRS OPC-UA Session Reconnected")

    # ------------------------------------------------------------------
    # LED state query
    # ------------------------------------------------------------------

    def get_led_states(self) -> dict:
        return self.led_service.get_all_states()

    def _on_led_state_change(self, box_id: str, active: bool, prev: bool):
        """
        Callback triggered when LED state changes.
        Tracks transition from True (active) to False (inactive) to determine
        when a store or retrieve operation completes.
        """
        if prev and not active:
            # Transition from active to inactive (operation completed)
            snapshot = self.shuttle.snapshot()
            if snapshot["state"] == "busy":
                shuttle_target = f"{snapshot['column']}{snapshot['row']}"
                if box_id == shuttle_target:
                    logging.info(
                        f"[ASRSController] Detected transition to OFF for box {box_id}. "
                        f"Active command '{snapshot['command']}' complete."
                    )
                    cmd = snapshot["command"]
                    if cmd and cmd.upper().endswith("S"):
                        logging.info(f"[ASRSController] Store operation complete. Setting shuttle to idle.")
                        self.shuttle.set_idle()
                        _log_asrs_event("info", "info", f"ASRS Store Complete on Box {box_id}", {"box_id": box_id, "command": cmd})
                    else:
                        logging.info(f"[ASRSController] Retrieve operation complete. Returning shuttle to drop-off.")
                        self.shuttle.return_to_dropoff()
                        _log_asrs_event("info", "info", f"ASRS Retrieve Complete on Box {box_id}", {"box_id": box_id, "command": cmd})
