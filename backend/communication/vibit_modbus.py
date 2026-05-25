import logging
import struct
from typing import Dict, List, Tuple

from pymodbus.client import ModbusTcpClient

logger = logging.getLogger(__name__)


def _decode_vibit_float(reg0: int, reg1: int) -> float:
    """Decode word-swapped float32 used by VibIT register layout."""
    raw = struct.pack(">HH", reg1, reg0)
    return round(struct.unpack(">f", raw)[0], 2)


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
    def __init__(self, host: str, port: int = 502, device_id: int = 1, timeout: float = 0.5):
        self.host = host
        self.port = port
        self.device_id = device_id
        self.client = ModbusTcpClient(host, port=port, timeout=timeout)
        self._last_log_time = {}

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

    def close(self) -> None:
        try:
            self.client.close()
        except Exception:
            logger.debug("Ignoring VibIT client close failure", exc_info=True)

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

    def read_snapshot(self) -> Dict[str, float] | None:
        """Read current VibIT metrics. Returns None if disconnected/fatal failure."""
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

        for base, count, fields in _REGISTER_GROUPS:
            try:
                res = self.client.read_input_registers(
                    address=base,
                    count=count,
                    device_id=self.device_id,
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

        return values
