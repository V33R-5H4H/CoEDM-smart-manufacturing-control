import functools
import logging
import struct
import threading
from typing import Dict, List, Tuple

from pymodbus.client import ModbusTcpClient

logger = logging.getLogger(__name__)


def _decode_vibit_float(reg0: int, reg1: int) -> float:
    """Decode word-swapped float32 used by VibIT register layout."""
    raw = struct.pack(">HH", reg1, reg0)
    return round(struct.unpack(">f", raw)[0], 2)


def _synchronized(func):
    """Decorator to serialize Modbus access via self.lock."""
    @functools.wraps(func)
    def wrapper(self, *args, **kwargs):
        with self.lock:
            return func(self, *args, **kwargs)
    return wrapper


# (base_address, count, [(offset_into_group, key_name), ...])
# We read separate groups to avoid undefined address gaps.
_REGISTER_GROUPS: List[Tuple[int, int, List[Tuple[int, str]]]] = [
    (
        4001,
        26,
        [
            (0, "x_rms_acc"),
            (2, "y_rms_acc"),
            (4, "z_rms_acc"),
            (6, "x_rms_vel"),
            (8, "y_rms_vel"),
            (10, "z_rms_vel"),
            (12, "temperature"),
            (14, "x_peak_acc"),
            (16, "y_peak_acc"),
            (18, "z_peak_acc"),
            (20, "x_peak_vel"),
            (22, "y_peak_vel"),
            (24, "z_peak_vel"),
        ],
    ),
    (4031, 2, [(0, "reboot_count")]),
    (4035, 2, [(0, "led_status")]),
    (4039, 2, [(0, "rpm")]),
]


class VibitModbusReader:
    _clients = {}
    _locks = {}
    _global_lock = threading.Lock()

    def __init__(self, host: str, port: int = 502, device_id: int = 1, timeout: float = 0.5, base_address: int = None, register_type: str = None):
        self.host = host
        self.port = port
        self.device_id = device_id
        self._last_log_time = {}
        if base_address is not None and register_type is not None:
            self._base_address = base_address
            self._register_type = register_type
            self._profile_detected = True
        else:
            self._profile_detected = False
            self._base_address = 4001
            self._register_type = "holding"

        # Each reader gets its own client and lock so concurrent asyncio.gather
        # calls can run in parallel threads without serialising on a shared lock.
        self.client = ModbusTcpClient(host, port=port, timeout=timeout)
        self.lock = threading.RLock()

    def _log_throttled(self, key: str, msg: str, *args, level=logging.WARNING, exc_info=None):
        import time
        now = time.time()
        # Log to stdout at the warning/error level at most once every 30 seconds per key.
        # Otherwise, log at DEBUG level.
        if now - self._last_log_time.get(key, 0.0) > 30.0:
            self._last_log_time[key] = now
            if level == logging.ERROR:
                logger.error(msg, *args, exc_info=exc_info)
            elif level == logging.WARNING:
                logger.warning(msg, *args, exc_info=exc_info)
            else:
                logger.log(level, msg, *args, exc_info=exc_info)
        else:
            logger.debug(msg, *args, exc_info=exc_info)

    @_synchronized
    def close(self) -> None:
        try:
            self.client.close()
        except Exception:
            logger.debug("Ignoring VibIT client close failure", exc_info=True)

    @_synchronized
    def _ensure_connected(self) -> bool:
        if self.client.connected:
            return True

        try:
            connected = self.client.connect()
            if connected:
                logger.info("Connected to VibIT Modbus at %s:%s", self.host, self.port)
            else:
                self._log_throttled(
                    "connect_fail",
                    "Unable to connect to VibIT Modbus at %s:%s (Unit ID %s)",
                    self.host,
                    self.port,
                    self.device_id,
                    level=logging.WARNING
                )
            return bool(connected)
        except Exception as e:
            self._log_throttled(
                "connect_exception",
                "Exception connecting to VibIT Modbus at %s:%s: %s",
                self.host,
                self.port,
                str(e),
                level=logging.ERROR
            )
            return False

    @_synchronized
    def read_energy_snapshot(self, word_swap: bool = True) -> Dict[str, float] | None:
        """Read current Energy Meter input registers 42-43 (Active Power) and 58-59 (Active Energy).
        Returns dict with 'power' (kW) and 'kwh' (kWh), or None if offline.
        """
        if not self._ensure_connected():
            return None

        # 1. Read Active Power (Total kW): registers 42-43
        try:
            res_p = self.client.read_input_registers(
                address=42,
                count=2,
                slave=self.device_id,
            )
        except Exception as e:
            self._log_throttled(
                f"read_power_exception_{self.device_id}",
                "Exception reading Power registers at 42 (Unit ID %s): %s",
                self.device_id,
                str(e),
                level=logging.WARNING
            )
            try:
                self.client.close()
            except Exception:
                pass
            return None

        if res_p.isError():
            self._log_throttled(
                f"read_power_error_{self.device_id}",
                "Modbus error reading Power registers at 42 (Unit ID %s): %s",
                self.device_id,
                str(res_p),
                level=logging.WARNING
            )
            return None

        # 2. Read Active Energy (Total Net kWh): registers 58-59
        try:
            res_e = self.client.read_input_registers(
                address=58,
                count=2,
                slave=self.device_id,
            )
        except Exception as e:
            self._log_throttled(
                f"read_energy_exception_{self.device_id}",
                "Exception reading Energy registers at 58 (Unit ID %s): %s",
                self.device_id,
                str(e),
                level=logging.WARNING
            )
            try:
                self.client.close()
            except Exception:
                pass
            return None

        if res_e.isError():
            self._log_throttled(
                f"read_energy_error_{self.device_id}",
                "Modbus error reading Energy registers at 58 (Unit ID %s): %s",
                self.device_id,
                str(res_e),
                level=logging.WARNING
            )
            return None

        regs_p = res_p.registers
        regs_e = res_e.registers

        if len(regs_p) < 2 or len(regs_e) < 2:
            return None

        try:
            # Active Power: registers 42-43 (indices 0, 1)
            reg_p0 = regs_p[0]
            reg_p1 = regs_p[1]
            if word_swap:
                raw_p = struct.pack(">HH", reg_p1, reg_p0)
            else:
                raw_p = struct.pack(">HH", reg_p0, reg_p1)
            power = round(struct.unpack(">f", raw_p)[0], 4)

            # Total Active Energy: registers 58-59 (indices 0, 1)
            reg_e0 = regs_e[0]
            reg_e1 = regs_e[1]
            if word_swap:
                raw_e = struct.pack(">HH", reg_e1, reg_e0)
            else:
                raw_e = struct.pack(">HH", reg_e0, reg_e1)
            kwh = round(struct.unpack(">f", raw_e)[0], 4)

            return {
                "power": power,
                "kwh": kwh,
                "raw_power_regs": [reg_p0, reg_p1],
                "raw_kwh_regs": [reg_e0, reg_e1]
            }
        except Exception as e:
            self._log_throttled(
                f"decode_energy_error_{self.device_id}",
                "Failed decoding energy registers (Unit ID %s): %s",
                self.device_id,
                str(e),
                level=logging.ERROR
            )
            return None

    @_synchronized
    def _detect_sensor_profile(self) -> bool:
        """Auto-detect the Modbus register type (holding vs input) and base address
        for this VibIT vibration sensor by probing the device.
        """
        if self._profile_detected:
            return True

        if not self._ensure_connected():
            return False

        # Candidates to try: (base_address, register_type)
        candidates = [
            (4000, "input"),      # MIRAC spindle (unit 1), TRIAC feed (unit 3)
            (4001, "holding"),    # Standard VibIT holding base
            (4050, "holding"),    # TRIAC tool (unit 2)
            (4050, "input"),
            (4000, "holding"),
            (4001, "input"),
        ]

        for base, reg_type in candidates:
            try:
                if reg_type == "holding":
                    res = self.client.read_holding_registers(
                        address=base,
                        count=26,
                        slave=self.device_id,
                    )
                else:
                    res = self.client.read_input_registers(
                        address=base,
                        count=26,
                        slave=self.device_id,
                    )

                if res and not res.isError() and hasattr(res, "registers") and len(res.registers) >= 26:
                    self._base_address = base
                    self._register_type = reg_type
                    self._profile_detected = True
                    logger.info(
                        "Auto-detected VibIT sensor profile for Unit ID %s: %s registers starting at %s",
                        self.device_id,
                        reg_type,
                        base
                    )
                    return True
            except Exception:
                continue

        # If probing fails, fall back to holding registers starting at 4001
        self._base_address = 4001
        self._register_type = "holding"
        self._profile_detected = True
        logger.warning(
            "VibIT sensor profile detection failed for Unit ID %s. Falling back to holding registers at 4001.",
            self.device_id
        )
        return True

    @_synchronized
    def read_snapshot(self) -> Dict[str, float] | None:
        """Read current VibIT metrics using auto-detected profile."""
        if not self._profile_detected:
            if not self._detect_sensor_profile():
                return None

        if not self._ensure_connected():
            return None

        def _is_comm_error(error_msg: str) -> bool:
            err_lower = error_msg.lower()
            return (
                "no response" in err_lower
                or "gateway" in err_lower
                or "timeout" in err_lower
                or "connection" in err_lower
            )

        values: Dict[str, float] = {}

        # Define dynamic register groups based on detected base address
        dynamic_groups = [
            (
                self._base_address,
                26,
                [
                    (0, "x_rms_acc"),
                    (2, "y_rms_acc"),
                    (4, "z_rms_acc"),
                    (6, "x_rms_vel"),
                    (8, "y_rms_vel"),
                    (10, "z_rms_vel"),
                    (12, "temperature"),
                    (14, "x_peak_acc"),
                    (16, "y_peak_acc"),
                    (18, "z_peak_acc"),
                    (20, "x_peak_vel"),
                    (22, "y_peak_vel"),
                    (24, "z_peak_vel"),
                ],
            ),
            (self._base_address + 30, 2, [(0, "reboot_count")]),
            (self._base_address + 34, 2, [(0, "led_status")]),
            (self._base_address + 38, 2, [(0, "rpm")]),
        ]

        for base, count, fields in dynamic_groups:
            try:
                if self._register_type == "holding":
                    res = self.client.read_holding_registers(
                        address=base,
                        count=count,
                        slave=self.device_id,
                    )
                else:
                    res = self.client.read_input_registers(
                        address=base,
                        count=count,
                        slave=self.device_id,
                    )
            except Exception as e:
                err_str = str(e)
                self._log_throttled(
                    f"read_exception_{base}_{self.device_id}",
                    "Exception while reading VibIT block %s+%s (Unit ID %s): %s",
                    base,
                    count,
                    self.device_id,
                    err_str,
                    level=logging.WARNING
                )
                if _is_comm_error(err_str):
                    # Force close and reconnect on next call
                    try:
                        self.client.close()
                    except Exception:
                        pass
                    break
                continue

            if res.isError():
                err_str = str(res)
                self._log_throttled(
                    f"read_error_{base}_{self.device_id}",
                    "Modbus error reading VibIT block %s+%s (Unit ID %s): %s",
                    base,
                    count,
                    self.device_id,
                    err_str,
                    level=logging.WARNING
                )
                if _is_comm_error(err_str):
                    break
                continue

            regs = res.registers
            for offset, key in fields:
                try:
                    if len(regs) > offset + 1:
                        values[key] = _decode_vibit_float(regs[offset], regs[offset + 1])
                except Exception as e:
                    self._log_throttled(
                        f"decode_error_{key}_{self.device_id}",
                        "Failed decoding VibIT key '%s' in block %s (Unit ID %s): %s",
                        key,
                        base,
                        self.device_id,
                        str(e),
                        level=logging.ERROR
                    )

        if not values:
            return None

        # Expose auto-detected profile parameters so the frontend and broadcaster
        # can show the precise physical address mapping.
        values["base_address"] = float(self._base_address)
        values["is_holding"] = 1.0 if self._register_type == "holding" else 0.0

        return values
