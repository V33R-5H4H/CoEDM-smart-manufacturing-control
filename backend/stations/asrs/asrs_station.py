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

# Grid constants
LETTERS = ["A", "B", "C", "D", "E"]
NUMBERS = range(1, 8)
PLC_NAMESPACE = settings.ASRS_OPCUA_NS

# Single shared connection — URL from settings
asrs_connection = OPCUAConnection(settings.ASRS_OPCUA_URL)


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
        """Connect to PLC, enforce A7 home baseline, and start LED monitoring."""
        logging.info("[ASRS] connect() called")
        asrs_connection.connect()

        # Hardware limitation: true shuttle position is not readable on startup.
        # Always re-baseline logical state to Home (A7) on every connect.
        self.shuttle.reset_home()

        self._subscribe_to_leds()
        logging.info("[ASRS] Connected, shuttle reset to Home (A7), and LED subscription active.")

    def disconnect(self):
        """Stop LED monitoring and disconnect from PLC."""
        logging.info("[ASRS] disconnect() called")
        self._unsubscribe_leds()
        asrs_connection.disconnect()
        logging.info("[ASRS] Disconnected.")

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

        # Safety curtain lockout
        if self.led_service.led_state.get("saftcy", False):
            raise Exception("Cannot execute command: Safety curtain is breached.")

        # Determine operation type
        if cmd == "HOME":
            operation = "HOME"
        elif cmd.endswith("S"):
            operation = "STORE"
        else:
            operation = "RETRIEVE"

        # Update shuttle position BEFORE pulsing (so frontend sees "moving" immediately)
        if cmd != "HOME":
            target = cmd.rstrip("S")
            col = target[0]
            row = int(target[1])
            self.shuttle.set_moving(col, row, cmd)

        # Pulse the PLC node
        logging.info(f"[ASRS] Pulsing node '{cmd}'")
        asrs_connection.pulse_node(cmd)
        logging.info(f"[ASRS] {operation} command '{cmd}' executed successfully.")

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

<<<<<<< HEAD
<<<<<<< HEAD
                # Also subscribe to the native ASRS saftey curtain node
                safety_tag = "saftey"
                safety_node_id = f"ns={PLC_NAMESPACE};s={safety_tag}"
                try:
                    safety_node = asrs_connection.client.get_node(safety_node_id)
                    safety_value = safety_node.get_value()
                    led_nodes.append(safety_node)
                    node_to_tag[safety_node.nodeid.to_string()] = safety_tag

                    # Seed the LED service with initial safety state
                    self.led_service.safety_curtain = bool(safety_value)
                    self.led_service.prev_safety_curtain = bool(safety_value)
                    logging.info(f"[ASRS] Subscribed to safety node with initial value: {safety_value}")
                except Exception as e:
                    logging.warning(f"[ASRS] Safety tag '{safety_tag}' unavailable: {e}")
=======
                # Subscribe to the Safety Curtain tag
                saftcy_tag = "saftcy"
                saftcy_node_id = f"ns={PLC_NAMESPACE};s={saftcy_tag}"
                try:
                    node = asrs_connection.client.get_node(saftcy_node_id)
                    value = node.get_value()
                    led_nodes.append(node)
                    node_to_tag[node.nodeid.to_string()] = saftcy_tag
                    self.led_service.led_state[saftcy_tag] = bool(value)
                    self.led_service.prev_led_state[saftcy_tag] = bool(value)
                except Exception as e:
                    logging.warning(f"[ASRS] Safety curtain tag {saftcy_tag} unavailable: {e}")
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849

=======
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)
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
                    else:
                        logging.info(f"[ASRSController] Retrieve operation complete. Returning shuttle to drop-off.")
                        self.shuttle.return_to_dropoff()
