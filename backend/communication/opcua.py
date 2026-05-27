"""
OPC-UA Connection Manager

Uses asyncua.sync.Client which provides a synchronous interface safe for use
in regular threads (no event loop required in the calling thread).
"""

from asyncua.sync import Client  # synchronous wrapper — safe for threading
from asyncua import ua
import time
import logging
from threading import Thread, Lock


class OPCUAConnection:
    """
    Manages a single OPC UA session to the PLC.

    Guarantees:
    - Only ONE client/session exists at any time.
    - Automatic health monitoring with reconnection.
    - Reconnect callbacks notify subscribers (e.g., ASRSController) to re-subscribe.
    """

    def __init__(self, server_url: str):
        self.server_url = server_url
        self.client = None
        self.connected = False
        self._lock = Lock()
        self._monitor_thread = None
        self._monitor_running = False
        self._reconnect_callbacks = []

    def register_reconnect_callback(self, callback):
        """Register a callback to invoke after successful reconnection."""
        self._reconnect_callbacks.append(callback)

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def connect(self):
        """Establish a NEW OPC UA session.  Idempotent – returns immediately
        if already connected."""
        with self._lock:
            if self.connected and self.client:
                return

            # If a stale client object exists while not connected, ensure the
            # previous session/socket is torn down before creating a new one.
            if self.client and not self.connected:
                self._raw_disconnect()

            self._raw_connect()

            # Start health monitor (only once)
            if not self._monitor_running:
                self._monitor_running = True
                self._monitor_thread = Thread(target=self._monitor_loop, daemon=True)
                self._monitor_thread.start()

    def disconnect(self):
        """Tear down the current session completely."""
        with self._lock:
            self._raw_disconnect()

    def reconnect(self):
        """Full disconnect → connect cycle.  Called by the monitor thread
        or externally after a detected failure."""
        with self._lock:
            self._raw_disconnect()
            try:
                self._raw_connect()
                logging.info("[OPC] Reconnected successfully.")
                # Notify listeners so they can re-subscribe
                for cb in self._reconnect_callbacks:
                    try:
                        cb()
                    except Exception as e:
                        logging.error(f"[OPC] Reconnect callback error: {e}")
            except Exception as e:
                logging.error(f"[OPC] Reconnect failed: {e}")

    # ------------------------------------------------------------------
    # Node helpers
    # ------------------------------------------------------------------

    def get_node(self, tag_name: str):
        if not self.connected:
            raise Exception("Not connected to OPC UA server")
        return self.client.get_node(f"ns=4;s={tag_name}")

    def pulse_node(self, tag_name: str, duration: float = 0.1):
        """Pulse a boolean tag: True → sleep → False."""
        if not self.connected:
            raise Exception("Not connected to OPC UA server")

        node = self.client.get_node(f"ns=4;s={tag_name}")

        def _write(val: bool):
            node.write_value(ua.DataValue(ua.Variant(val, ua.VariantType.Boolean)))

        _write(True)
        time.sleep(duration)
        _write(False)

    def set_node_state(self, tag_name: str, value: bool = True):
        """
        Write a boolean value to a node.

        Used for immediate control commands (e.g., BEARING_ON, SHAFT_ON).
        For pulsed commands, use pulse_node() instead.

        Args:
            tag_name: The OPC UA tag name (e.g., "|var|AX-308EA0MA1P.Application.PLC_PRG...")
            value: Boolean value to write (default True for ON commands)

        Raises:
            Exception: If not connected to OPC UA server
        """
        if not self.connected:
            raise Exception("Not connected to OPC UA server")

        try:
            node = self.client.get_node(f"ns=4;s={tag_name}")
            node.write_value(ua.DataValue(ua.Variant(value, ua.VariantType.Boolean)))
            logging.info(f"[OPC] Wrote {value} to node {tag_name}")
        except Exception as e:
            logging.error(f"[OPC] Failed to write to node {tag_name}: {e}")
            raise

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _raw_connect(self):
        """Create a fresh sync Client and connect (must hold self._lock)."""
        logging.info(f"[OPC] Connecting to {self.server_url}...")
        self.client = Client(self.server_url, timeout=60)
        self.client.connect()
        self.connected = True
        logging.info("[OPC] Connected.")

    def _raw_disconnect(self):
        """Disconnect and destroy the current client (must hold self._lock)."""
        if self.client:
            try:
                self.client.disconnect()
            except Exception:
                pass
            self.client = None
        self.connected = False

    def _monitor_loop(self):
        """Background thread: periodically checks session health."""
        logging.info("[OPC] Connection monitor started.")
        while self._monitor_running:
            time.sleep(10)  # check every 10s

            if not self.connected:
                continue

            # Read outside the lock to avoid blocking API threads
            try:
                with self._lock:
                    if not self.client:
                        continue
                    root = self.client.get_root_node()
                root.get_children()  # network call outside lock
            except Exception as e:
                logging.warning(f"[OPC] Connection lost: {e}")
                # reconnect() acquires the lock itself
                try:
                    self.reconnect()
                except Exception as re_err:
                    logging.error(f"[OPC] Auto-reconnect failed: {re_err}")
