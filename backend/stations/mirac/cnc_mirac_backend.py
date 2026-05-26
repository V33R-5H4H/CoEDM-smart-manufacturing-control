"""
MIRAC VIBIT Data Gateway
Clean industrial data pipeline: Modbus → Decode → Store → API

Architecture:
    Modbus TCP Device (VIBIT has 2 slave IDs: unit 1 & unit 2)
         ↓
    [Read Registers from both slaves concurrently]
         ↓
    [Decode Float32 Big-Endian Word-Swap]
         ↓
    [Store in Global State — vibit1 (slave 1) + vibit2 (slave 2)]
         ↓
    [HTTP/WebSocket API — unified + per-slave endpoints]
"""

import logging
import struct
import threading
import time
from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)


@dataclass
class VIBITMetrics:
    """Single VIBIT sensor slave metrics"""
    timestamp: str = ""
    unit_id: int = 0
    connected: bool = False
    x_rms_acceleration: float = 0.0
    y_rms_acceleration: float = 0.0
    z_rms_acceleration: float = 0.0
    x_rms_velocity: float = 0.0
    y_rms_velocity: float = 0.0
    z_rms_velocity: float = 0.0
    x_peak_acceleration: float = 0.0
    y_peak_acceleration: float = 0.0
    z_peak_acceleration: float = 0.0
    x_peak_velocity: float = 0.0
    y_peak_velocity: float = 0.0
    z_peak_velocity: float = 0.0
    temperature: float = 0.0
    rpm: float = 0.0
    reboot_count: float = 0.0
    led_status: float = 0.0
    # Direct CNC OPC UA tags (only on primary slave state)
    x_axis_value: float = 0.0
    z_axis_value: float = 0.0
    spindle_speed: float = 0.0
    spindle_temp: float = 0.0
    spindle_vibration: float = 0.0
    tool_number: float = 1.0
    tool_temp: float = 0.0
    tool_vibration: float = 0.0
    cycle_start: bool = False
    cycle_stop: bool = False
    pneumatic_chuck: bool = False
    led_green: bool = False
    led_yellow: bool = False
    led_red: bool = False


class MIRACDataGateway:
    """
    Industrial data pipeline for MIRAC VIBIT sensors.
    The MIRAC VIBIT device has TWO Modbus slave unit IDs on the same host:
      - Unit 1: Spindle-side vibration sensor
      - Unit 2: Tool/bearing-side vibration sensor
    Both are read concurrently in the background thread.
    """

    def __init__(self, host: str = None, port: int = None,
                 unit_id_1: int = None, unit_id_2: int = None):
        from backend.config import settings
        self.host = host or settings.VIBIT_HOST
        self.port = port or settings.VIBIT_PORT
        self.unit_id_1 = unit_id_1 if unit_id_1 is not None else settings.VIBIT_UNIT_ID
        self.unit_id_2 = unit_id_2 if unit_id_2 is not None else settings.VIBIT_UNIT_ID_2

        self.state: Dict[str, VIBITMetrics] = {
            "vibit1": VIBITMetrics(timestamp=datetime.now().isoformat()),
            "vibit2": VIBITMetrics(timestamp=datetime.now().isoformat()),
            "vibit3": VIBITMetrics(timestamp=datetime.now().isoformat()),
        }

        # Connectivity tracking — per slave + OPC-UA
        self._connectivity = {
            "vibit1": False,
            "vibit2": False,
            "opcua": False,
        }

        self.is_connected = False
        self.read_interval = 0.5   # 500ms — safe default
        self.is_reading = False
        self._lock = threading.Lock()

    @staticmethod
    def decode_float32(low_word: int, high_word: int) -> float:
        """
        Decode IEEE 754 float from Modbus word-swapped registers
        
        Many Modbus devices swap words, so we need:
            buf[0:2] = high_word (bytes 0-1)
            buf[2:4] = low_word  (bytes 2-3)
        
        Args:
            low_word: First register value
            high_word: Second register value
            
        Returns:
            Decoded float32 value
        """
        try:
            buf = bytearray(4)
            # Word-swap + big-endian
            buf[0:2] = high_word.to_bytes(2, byteorder='big')
            buf[2:4] = low_word.to_bytes(2, byteorder='big')

            int_val = int.from_bytes(buf, byteorder='big', signed=False)
            return struct.unpack('>f', struct.pack('>I', int_val))[0]
        except Exception as e:
            logger.error(f"Decode error for registers {low_word}, {high_word}: {e}")
            return 0.0

    def validate_registers(self, payload: list) -> bool:
        """Validate Modbus read response"""
        if not payload or len(payload) < 2:
            logger.warning("Invalid Modbus response: missing data")
            return False
        if not all(isinstance(x, int) for x in payload):
            logger.warning("Invalid Modbus response: non-integer values")
            return False
        return True

    async def read_sensor_data(self, client) -> Optional[Dict]:
        """
        Read all VIBIT1 sensor data from Modbus
        
        Returns:
            Dictionary of decoded metrics or None on error
        """
        try:
            metrics = {}
            
            # Read all registers (2 registers per metric for 32-bit float)
            for metric_name, register_addr in self.REGISTER_MAP.items():
                try:
                    # Read 2 registers (32-bit float = 2 × 16-bit registers)
                    payload = await asyncio.wait_for(
                        self._read_registers(client, register_addr, 2),
                        timeout=1.0
                    )
                    
                    if not self.validate_registers(payload):
                        continue
                    
                    # Decode: low_word, high_word → float32
                    value = self.decode_float32(payload[0], payload[1])
                    metrics[metric_name] = round(value, 2)
                    
                except asyncio.TimeoutError:
                    logger.warning(f"Timeout reading {metric_name} @ register {register_addr}")
                    continue
                except Exception as e:
                    logger.warning(f"Error reading {metric_name}: {e}")
                    continue
            
            return metrics if metrics else None
            
        except Exception as e:
            logger.error(f"Read sensor data error: {e}")
            return None

    async def _read_registers(self, client, addr: int, count: int):
        """Placeholder for actual Modbus read (implement with pymodbus)"""
        # This would use pymodbus client:
        # result = await client.read_holding_registers(addr, count, slave=1)
        # return result.registers
        raise NotImplementedError("Use pymodbus for actual Modbus reads")

    def update_state(self, sensor: str, metrics: Dict) -> None:
        """Update global state with decoded metrics for a specific sensor"""
        if not metrics:
            return
        
        with self._lock:
            if sensor in self.state:
                current = self.state[sensor]
                for key, value in metrics.items():
                    if hasattr(current, key):
                        setattr(current, key, value)
                current.timestamp = datetime.now().isoformat()

    def get_state(self, sensor: str = None) -> Optional[Dict]:
        """Get current sensor state. If sensor is None, returns all sensors combined."""
        with self._lock:
            if sensor:
                if sensor in self.state:
                    return asdict(self.state[sensor])
                return None
            return {k: asdict(v) for k, v in self.state.items()}

    async def start_reading(self, client) -> None:
        """Start continuous Modbus reads at safe interval"""
        self.is_reading = True
        logger.info(f"Starting VIBIT data reads at {self.read_interval * 1000}ms interval")
        
        while self.is_reading:
            try:
                now = datetime.now().isoformat()

                # ── Read OPC-UA ──────────────────────────────────────
                opc_data: Dict = {}
                opc_connected = False
                if opcua_connection.connected:
                    try:
                        for tag_name, nid in MIRAC_DATA_TAGS.items():
                            try:
                                node = opcua_connection.client.get_node(nid)
                                val = node.get_value()
                                if val is not None:
                                    opc_data[tag_name] = val
                            except Exception as e:
                                logger.debug(f"Failed to read tag {tag_name}: {e}")
                        opc_connected = bool(opc_data)
                    except Exception as e:
                        logger.warning(f"OPC-UA read loop error: {e}")

                with self._lock:
                    self._connectivity["opcua"] = opc_connected

                # ── Read VIBIT slave 1 (spindle) ─────────────────────
                data1 = reader.read_snapshot(device_id=self.unit_id_1)
                v1_connected = data1 is not None

                with self._lock:
                    self._connectivity["vibit1"] = v1_connected
                    s1 = self.state["vibit1"]
                    s1.timestamp = now
                    s1.connected = v1_connected
                    if data1:
                        s1.x_rms_acceleration  = data1.get("x_rms_acc", 0.0)
                        s1.y_rms_acceleration  = data1.get("y_rms_acc", 0.0)
                        s1.z_rms_acceleration  = data1.get("z_rms_acc", 0.0)
                        s1.x_rms_velocity      = data1.get("x_rms_vel", 0.0)
                        s1.y_rms_velocity      = data1.get("y_rms_vel", 0.0)
                        s1.z_rms_velocity      = data1.get("z_rms_vel", 0.0)
                        s1.x_peak_acceleration = data1.get("x_peak_acc", 0.0)
                        s1.y_peak_acceleration = data1.get("y_peak_acc", 0.0)
                        s1.z_peak_acceleration = data1.get("z_peak_acc", 0.0)
                        s1.x_peak_velocity     = data1.get("x_peak_vel", 0.0)
                        s1.y_peak_velocity     = data1.get("y_peak_vel", 0.0)
                        s1.z_peak_velocity     = data1.get("z_peak_vel", 0.0)
                        s1.temperature         = data1.get("temperature", 0.0)
                        s1.rpm                 = data1.get("rpm", 0.0)
                        s1.reboot_count        = data1.get("reboot_count", 0.0)
                        s1.led_status          = data1.get("led_status", 0.0)
                    # Mix OPC-UA values
                    for tag_name in MIRAC_DATA_TAGS.keys():
                        if tag_name in opc_data and hasattr(s1, tag_name):
                            setattr(s1, tag_name, opc_data[tag_name])

                # ── Read VIBIT slave 2 (tool/bearing) ────────────────
                data2 = reader.read_snapshot(device_id=self.unit_id_2)
                v2_connected = data2 is not None

                with self._lock:
                    self._connectivity["vibit2"] = v2_connected
                    s2 = self.state["vibit2"]
                    s2.timestamp = now
                    s2.connected = v2_connected
                    if data2:
                        s2.x_rms_acceleration  = data2.get("x_rms_acc", 0.0)
                        s2.y_rms_acceleration  = data2.get("y_rms_acc", 0.0)
                        s2.z_rms_acceleration  = data2.get("z_rms_acc", 0.0)
                        s2.x_rms_velocity      = data2.get("x_rms_vel", 0.0)
                        s2.y_rms_velocity      = data2.get("y_rms_vel", 0.0)
                        s2.z_rms_velocity      = data2.get("z_rms_vel", 0.0)
                        s2.x_peak_acceleration = data2.get("x_peak_acc", 0.0)
                        s2.y_peak_acceleration = data2.get("y_peak_acc", 0.0)
                        s2.z_peak_acceleration = data2.get("z_peak_acc", 0.0)
                        s2.x_peak_velocity     = data2.get("x_peak_vel", 0.0)
                        s2.y_peak_velocity     = data2.get("y_peak_vel", 0.0)
                        s2.z_peak_velocity     = data2.get("z_peak_vel", 0.0)
                        s2.temperature         = data2.get("temperature", 0.0)
                        s2.rpm                 = data2.get("rpm", 0.0)
                        s2.reboot_count        = data2.get("reboot_count", 0.0)
                        s2.led_status          = data2.get("led_status", 0.0)

                # ── Database Persistence ─────────────────────────────
                self._db_tick += 1
                if self._db_tick >= 10:
                    self._db_tick = 0
                    if data1: write_vibit_reading(data1)
                    if data2: write_vibit_reading(data2)
                    if opc_connected: write_mirac_plc_reading(opc_data, connected=True)

                # Wait for next tick (~10Hz base rate)
                elapsed = (datetime.now() - datetime.fromisoformat(now)).total_seconds()
                import time
                time.sleep(max(0.01, 0.1 - elapsed))

            except Exception as e:
                logger.error(f"Error in MIRAC dual-slave read loop: {e}")

            step += 1
            time.sleep(self.read_interval)

        reader1.close()
        reader2.close()


# ── Module-level singletons ─────────────────────────────────────────────────

mirac_gateway = MIRACDataGateway()


def get_vibit_data(sensor: str = None) -> Optional[Dict]:
    """API endpoint to get current VIBIT metrics"""
    return mirac_gateway.get_state(sensor)


def set_read_interval(interval_ms: int) -> None:
    """Adjust read interval (100–5000ms)."""
    if not (100 <= interval_ms <= 5000):
        raise ValueError("Interval must be 100–5000ms")
    mirac_gateway.read_interval = interval_ms / 1000
    logger.info(f"Updated MIRAC read interval to {interval_ms}ms")
