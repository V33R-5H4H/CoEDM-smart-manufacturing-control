"""
backend/communication/vibit_modbus.py
=====================================
VIBIT Modbus TCP reader.

Discovery confirmed:
  - Sensor data is exposed via Input Registers (FC04), addresses 4000–4039.
  - Holding registers (FC03) at the same addresses may be empty/zero.
  - Strategy: try Input Registers first (primary), fall back to Holding Registers.

Register layout (each pair = IEEE-754 float32, word-swapped big-endian):
  4000-4001  x_rms_acc       (mm/s²)
  4002-4003  y_rms_acc       (mm/s²)
  4004-4005  z_rms_acc       (mm/s²)
  4006-4007  x_rms_vel       (mm/s)
  4008-4009  y_rms_vel       (mm/s)
  4010-4011  z_rms_vel       (mm/s)
  4012-4013  temperature     (°C)
  4014-4015  x_peak_acc      (mm/s²)
  4016-4017  y_peak_acc      (mm/s²)
  4018-4019  z_peak_acc      (mm/s²)
  4020-4021  x_peak_vel      (mm/s)
  4022-4023  y_peak_vel      (mm/s)
  4024-4025  z_peak_vel      (mm/s)
  4030-4031  reboot_count
  4034-4035  led_status      (1.0 = green)
  4038-4039  rpm
"""

import logging
import struct
from typing import Dict, List, Optional, Tuple

from pymodbus.client import ModbusTcpClient

logger = logging.getLogger(__name__)


# ── Float decode ──────────────────────────────────────────────────────────────

def _decode_vibit_float(reg0: int, reg1: int) -> float:
    """
    Decode word-swapped IEEE-754 float32.
    VIBIT layout: reg0 = low word, reg1 = high word.
    Pack order: >HH(reg1, reg0) → big-endian float.
    """
    raw = struct.pack(">HH", reg1, reg0)
    return round(struct.unpack(">f", raw)[0], 4)


# ── Register groups ───────────────────────────────────────────────────────────
# (base_address, count, [(word_offset, field_name), ...])
# We read the minimal contiguous block covering each group to minimise
# Modbus round-trips while avoiding undefined address gaps.

_REGISTER_GROUPS: List[Tuple[int, int, List[Tuple[int, str]]]] = [
    # Main sensor block: 4000–4025 (26 words)
    (
        4000,
        26,
        [
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
        ],
    ),
    # Device info: reboot_count (4030-4031)
    (4030, 2, [(0, "reboot_count")]),
    # LED status (4034-4035)
    (4034, 2, [(0, "led_status")]),
    # RPM (4038-4039)
    (4038, 2, [(0, "rpm")]),
]


# ── Reader class ──────────────────────────────────────────────────────────────

class VibitModbusReader:
    """
    Modbus TCP client for VIBIT slave units.

    Strategy per read:
      1. Try Input Registers (FC04) — this is where VIBIT exposes live data.
      2. If FC04 returns an error for a group, fall back to Holding Registers (FC03).

    A single ModbusTcpClient instance is reused across reads; reconnection
    is attempted transparently on each snapshot call.
    """

    def __init__(self, host: str, port: int = 502):
        self.host = host
        self.port = port
        self._client = ModbusTcpClient(host, port=port, timeout=3)

    # ── Connection ────────────────────────────────────────────────────────────

    def close(self) -> None:
        try:
            self._client.close()
        except Exception:
            logger.debug("VibIT client close suppressed", exc_info=True)

    def _ensure_connected(self) -> bool:
        if self._client.connected:
            return True
        try:
            ok = self._client.connect()
            if ok:
                logger.info("VibIT connected: %s:%s", self.host, self.port)
            else:
                logger.warning("VibIT connect returned False: %s:%s", self.host, self.port)
            return bool(ok)
        except Exception:
            logger.exception("VibIT connect exception")
            return False

    # ── Single-group read (FC04 → FC03 fallback) ──────────────────────────────

    def _read_group(self, base: int, count: int, device_id: int) -> Optional[List[int]]:
        """
        Read `count` registers starting at `base`.
        Returns list of register values, or None on failure.
        """
        for fn_name, fn in [
            ("FC04 input",   self._client.read_input_registers),
            ("FC03 holding", self._client.read_holding_registers),
        ]:
            try:
                resp = fn(address=base, count=count, slave=device_id)
                if not resp.isError():
                    regs = resp.registers
                    if any(r != 0 for r in regs):
                        return regs
            except Exception as exc:
                logger.debug("VibIT %s read failed @%s+%s unit=%s: %s", fn_name, base, count, device_id, exc)

        return None

    # ── Snapshot ──────────────────────────────────────────────────────────────

    def read_snapshot(self, device_id: int = 1) -> Optional[Dict[str, float]]:
        """
        Read all VIBIT metrics for a specific slave unit.
        """
        if not self._ensure_connected():
            return None

        values: Dict[str, float] = {}

        for base, count, fields in _REGISTER_GROUPS:
            regs = self._read_group(base, count, device_id)
            if regs is None:
                continue

            for offset, key in fields:
                try:
                    values[key] = _decode_vibit_float(regs[offset], regs[offset + 1])
                except (IndexError, struct.error) as exc:
                    logger.debug("VibIT decode error key='%s' block=%s unit=%s: %s", key, base, device_id, exc)

        if not values:
            return None

        return values
