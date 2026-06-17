"""
backend/communication/vibit_modbus.py
======================================
VibIT Modbus TCP reader.

KEY DESIGN — shared gateway client
------------------------------------
The VibIT Modbus TCP gateway (e.g. 10.10.14.103) only supports ONE TCP
connection at a time.  Node-RED works because it uses a single persistent
connection and multiplexes all unit IDs over it (parallelUnitIdsAllowed=true).

Our previous design opened a separate ModbusTcpClient per unit ID, which
caused the gateway to reject all but the first connection.

Fix: VibitGateway holds ONE shared ModbusTcpClient per (host, port) pair.
All VibitModbusReader instances on the same gateway share that client via
a class-level registry.  A single RLock serialises all reads so unit IDs
are never interleaved on the wire.
"""

import logging
import struct
import threading
import time
from typing import Dict, List, Optional, Tuple

from pymodbus.client import ModbusTcpClient

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Float decode helpers
# ---------------------------------------------------------------------------

def _decode_vibit_float(reg0: int, reg1: int) -> float:
    """Decode word-swapped big-endian float32 (VibIT vibration sensors)."""
    raw = struct.pack(">HH", reg1, reg0)
    return round(struct.unpack(">f", raw)[0], 2)


def _decode_standard_float(reg0: int, reg1: int) -> float:
    """Decode standard big-endian float32 (energy meter)."""
    raw = struct.pack(">HH", reg0, reg1)
    return round(struct.unpack(">f", raw)[0], 4)


def _is_sane(v: float) -> bool:
    return v == v and abs(v) < 1e9  # not NaN, not Inf


# ---------------------------------------------------------------------------
# VibitGateway — one shared TCP connection per (host, port)
# ---------------------------------------------------------------------------

class VibitGateway:
    """
    Manages a single persistent ModbusTcpClient for one gateway IP:port.

    All unit IDs on the same gateway share this connection.  A single RLock
    serialises reads so requests are never interleaved on the wire — exactly
    matching Node-RED's parallelUnitIdsAllowed=true behaviour.
    """

    # Class-level registry: (host, port) → VibitGateway
    _registry: Dict[Tuple[str, int], "VibitGateway"] = {}
    _registry_lock = threading.Lock()

    @classmethod
    def get(cls, host: str, port: int = 502, timeout: float = 3.0) -> "VibitGateway":
        """Return the shared gateway for (host, port), creating it if needed."""
        key = (host, port)
        with cls._registry_lock:
            if key not in cls._registry:
                cls._registry[key] = cls(host, port, timeout)
            return cls._registry[key]

    def __init__(self, host: str, port: int, timeout: float):
        self.host = host
        self.port = port
        self.timeout = timeout
        self._client = ModbusTcpClient(host, port=port, timeout=timeout)
        self._lock = threading.RLock()
        self._last_connect_attempt = 0.0
        self._fail_count = 0
        self._last_log: Dict[str, float] = {}

    def _log_throttled(self, key: str, msg: str, *args, level=logging.WARNING):
        now = time.time()
        if now - self._last_log.get(key, 0.0) > 30.0:
            self._last_log[key] = now
            logger.log(level, msg, *args)
        else:
            logger.debug(msg, *args)

    def ensure_connected(self) -> bool:
        """Connect if not already connected. Exponential backoff on failure."""
        if self._client.connected:
            return True

        backoff = min(2 * (2 ** self._fail_count), 30)
        if time.time() - self._last_connect_attempt < backoff:
            return False

        self._last_connect_attempt = time.time()
        try:
            ok = self._client.connect()
            if ok:
                self._fail_count = 0
                logger.info("[VibIT] Connected to gateway %s:%s", self.host, self.port)
            else:
                self._fail_count += 1
                self._log_throttled(
                    "connect_fail",
                    "[VibIT] Cannot connect to gateway %s:%s",
                    self.host, self.port,
                )
            return bool(ok)
        except Exception as e:
            self._fail_count += 1
            self._log_throttled(
                "connect_exc",
                "[VibIT] Exception connecting to %s:%s: %s",
                self.host, self.port, e,
                level=logging.ERROR,
            )
            return False

    def read_input_registers(self, address: int, count: int, unit_id: int) -> Optional[List[int]]:
        with self._lock:
            if not self.ensure_connected():
                return None
            try:
                res = self._client.read_input_registers(address=address, count=count, slave=unit_id)
                if res is None or res.isError():
                    logger.debug(
                        "[VibIT] Input reg error addr=%s unit=%s: %s",
                        address, unit_id, res,
                    )
                    return None
                self._fail_count = 0
                return list(res.registers)
            except Exception as e:
                logger.debug(
                    "[VibIT] Input reg exception addr=%s unit=%s: %s",
                    address, unit_id, e,
                )
                try:
                    self._client.close()
                except Exception:
                    pass
                return None

    def read_holding_registers(self, address: int, count: int, unit_id: int) -> Optional[List[int]]:
        with self._lock:
            if not self.ensure_connected():
                return None
            try:
                res = self._client.read_holding_registers(address=address, count=count, slave=unit_id)
                if res is None or res.isError():
                    logger.debug(
                        "[VibIT] Holding reg error addr=%s unit=%s: %s",
                        address, unit_id, res,
                    )
                    return None
                self._fail_count = 0
                return list(res.registers)
            except Exception as e:
                logger.debug(
                    "[VibIT] Holding reg exception addr=%s unit=%s: %s",
                    address, unit_id, e,
                )
                try:
                    self._client.close()
                except Exception:
                    pass
                return None

    def close(self):
        with self._lock:
            try:
                self._client.close()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# VibIT sensor register layout
# ---------------------------------------------------------------------------

# Candidates to probe: (base_address, register_type)
_PROFILE_CANDIDATES = [
    (4000, "input"),    # MIRAC spindle U1, TRIAC sensors
    (4001, "holding"),  # Standard VibIT holding base
    (4050, "holding"),  # TRIAC tool U2
    (4050, "input"),
    (4000, "holding"),
    (4001, "input"),
]

_VIBIT_FIELDS = [
    (0,  "x_rms_acc"),
    (2,  "y_rms_acc"),
    (4,  "z_rms_acc"),
    (6,  "x_rms_vel"),
    (8,  "y_rms_vel"),
    (10, "z_rms_vel"),
    (12, "temperature"),
    (14, "x_peak_acc"),
    (16, "y_peak_acc"),
    (18, "z_peak_acc"),
    (20, "x_peak_vel"),
    (22, "y_peak_vel"),
    (24, "z_peak_vel"),
]

_VIBIT_EXTRA = [
    (30, "reboot_count"),
    (34, "led_status"),
    (38, "rpm"),
]


# ---------------------------------------------------------------------------
# VibitModbusReader — per unit-ID reader using the shared gateway
# ---------------------------------------------------------------------------

class VibitModbusReader:
    """
    Reads VibIT vibration sensor data for a single Modbus unit ID.

    Uses the shared VibitGateway for the underlying TCP connection so all
    readers on the same gateway share one persistent connection — matching
    Node-RED's behaviour.
    """

    def __init__(
        self,
        host: str,
        port: int = 502,
        device_id: int = 1,
        timeout: float = 3.0,
        base_address: int = None,
        register_type: str = None,
    ):
        self.host = host
        self.port = port
        self.device_id = device_id
        self._gateway = VibitGateway.get(host, port, timeout)
        self._last_log: Dict[str, float] = {}

        if base_address is not None and register_type is not None:
            self._base_address = base_address
            self._register_type = register_type
            self._profile_detected = True
        else:
            self._profile_detected = False
            self._base_address = 4001
            self._register_type = "holding"

    def _log_throttled(self, key: str, msg: str, *args, level=logging.WARNING):
        now = time.time()
        if now - self._last_log.get(key, 0.0) > 30.0:
            self._last_log[key] = now
            logger.log(level, msg, *args)
        else:
            logger.debug(msg, *args)

    def close(self) -> None:
        """No-op — the shared gateway manages the connection lifecycle."""
        pass

    # ------------------------------------------------------------------
    # Profile auto-detection
    # ------------------------------------------------------------------

    def _detect_sensor_profile(self) -> bool:
        """
        Probe candidate (base_address, register_type) combinations to find
        which one returns sane float32 data for this unit ID.

        Does NOT set _profile_detected on failure — retries next cycle.
        """
        if self._profile_detected:
            return True

        for base, reg_type in _PROFILE_CANDIDATES:
            if reg_type == "holding":
                regs = self._gateway.read_holding_registers(base, 26, self.device_id)
            else:
                regs = self._gateway.read_input_registers(base, 26, self.device_id)

            if regs is None or len(regs) < 26:
                continue

            # Check at least one pair decodes to a sane float
            sane = False
            for offset in range(0, 26, 2):
                if offset + 1 < len(regs):
                    try:
                        v = _decode_vibit_float(regs[offset], regs[offset + 1])
                        if _is_sane(v):
                            sane = True
                            break
                    except Exception:
                        pass

            if sane:
                self._base_address = base
                self._register_type = reg_type
                self._profile_detected = True
                logger.info(
                    "[VibIT] Auto-detected profile for Unit %s: %s regs @ base %s",
                    self.device_id, reg_type, base,
                )
                return True

        self._log_throttled(
            f"profile_fail_{self.device_id}",
            "[VibIT] Profile detection failed for Unit %s @ %s:%s — will retry",
            self.device_id, self.host, self.port,
        )
        return False

    # ------------------------------------------------------------------
    # VibIT vibration snapshot
    # ------------------------------------------------------------------

    def read_snapshot(self) -> Optional[Dict[str, float]]:
        """Read all VibIT vibration metrics for this unit ID."""
        if not self._profile_detected:
            if not self._detect_sensor_profile():
                return None

        values: Dict[str, float] = {}

        # Main block: 26 registers from base address
        if self._register_type == "holding":
            regs = self._gateway.read_holding_registers(self._base_address, 26, self.device_id)
        else:
            regs = self._gateway.read_input_registers(self._base_address, 26, self.device_id)

        if regs is None:
            # Connection or read failed — reset profile so we re-detect next cycle
            self._profile_detected = False
            return None

        for offset, key in _VIBIT_FIELDS:
            if offset + 1 < len(regs):
                try:
                    v = _decode_vibit_float(regs[offset], regs[offset + 1])
                    if _is_sane(v):
                        values[key] = v
                except Exception:
                    pass

        # Extra registers: reboot_count, led_status, rpm
        for offset, key in _VIBIT_EXTRA:
            addr = self._base_address + offset
            if self._register_type == "holding":
                extra = self._gateway.read_holding_registers(addr, 2, self.device_id)
            else:
                extra = self._gateway.read_input_registers(addr, 2, self.device_id)
            if extra and len(extra) >= 2:
                try:
                    v = _decode_vibit_float(extra[0], extra[1])
                    if _is_sane(v):
                        values[key] = v
                except Exception:
                    pass

        if not values:
            self._profile_detected = False
            return None

        values["base_address"] = float(self._base_address)
        values["is_holding"] = 1.0 if self._register_type == "holding" else 0.0
        return values

    # ------------------------------------------------------------------
    # Energy meter snapshot
    # ------------------------------------------------------------------

    def read_energy_snapshot(self, word_swap: bool = False) -> Optional[Dict]:
        """
        Read energy meter input registers:
          42-43 → Active Power (kW)
          58-59 → Total Net kWh

        word_swap=False uses standard big-endian (correct for this meter).
        """
        # Read power (addr 42) and energy (addr 58) in one call if possible,
        # or two separate calls. The meter has a gap between 43 and 58 so
        # we read them separately to avoid reading undefined registers.
        regs_p = self._gateway.read_input_registers(42, 2, self.device_id)
        if regs_p is None or len(regs_p) < 2:
            self._log_throttled(
                f"energy_power_fail_{self.device_id}",
                "[VibIT] Energy meter power read failed (Unit %s @ %s:%s) — sensor offline or RS-485 not responding",
                self.device_id, self.host, self.port,
            )
            return None

        regs_e = self._gateway.read_input_registers(58, 2, self.device_id)
        if regs_e is None or len(regs_e) < 2:
            self._log_throttled(
                f"energy_kwh_fail_{self.device_id}",
                "[VibIT] Energy meter kWh read failed (Unit %s @ %s:%s)",
                self.device_id, self.host, self.port,
            )
            return None

        try:
            if word_swap:
                power = _decode_vibit_float(regs_p[0], regs_p[1])
                kwh   = _decode_vibit_float(regs_e[0], regs_e[1])
            else:
                power = _decode_standard_float(regs_p[0], regs_p[1])
                kwh   = _decode_standard_float(regs_e[0], regs_e[1])

            return {
                "power": power,
                "kwh": kwh,
                "raw_power_regs": [regs_p[0], regs_p[1]],
                "raw_kwh_regs":   [regs_e[0], regs_e[1]],
            }
        except Exception as e:
            self._log_throttled(
                f"energy_decode_{self.device_id}",
                "[VibIT] Energy decode error (Unit %s): %s",
                self.device_id, e,
                level=logging.ERROR,
            )
            return None
