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
    def __init__(self, host: str, port: int = 502, device_id: int = 1):
        self.host = host
        self.port = port
        self.device_id = device_id
        self.client = ModbusTcpClient(host, port=port)

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
                logger.warning("Unable to connect to VibIT Modbus at %s:%s", self.host, self.port)
            return bool(connected)
        except Exception:
            logger.exception("Failed connecting to VibIT Modbus")
            return False

    def read_snapshot(self) -> Dict[str, float] | None:
        """Read current VibIT metrics. Returns None if disconnected/fatal failure."""
        if not self._ensure_connected():
            return None

        values: Dict[str, float] = {}

        for base, count, fields in _REGISTER_GROUPS:
            try:
                res = self.client.read_holding_registers(
                    address=base,
                    count=count,
                    device_id=self.device_id,
                )
            except Exception:
                logger.exception("Exception while reading VibIT block %s+%s", base, count)
                continue

            if res.isError():
                logger.error("Modbus error reading VibIT block %s+%s: %s", base, count, res)
                continue

            regs = res.registers
            for offset, key in fields:
                try:
                    values[key] = _decode_vibit_float(regs[offset], regs[offset + 1])
                except Exception:
                    logger.exception("Failed decoding VibIT key '%s' in block %s", key, base)

        if not values:
            return None

        return values
