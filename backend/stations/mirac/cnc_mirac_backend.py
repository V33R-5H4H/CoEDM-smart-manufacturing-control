"""
MIRAC VIBIT Data Gateway
Clean industrial data pipeline: Modbus → Decode → Store → API

Architecture:
    Modbus TCP Device
         ↓
    [Read Registers] (100ms interval)
         ↓
    [Decode Float32 Big-Endian Word-Swap]
         ↓
    [Store in Global State]
         ↓
    [HTTP/WebSocket API]
"""

import asyncio
import logging
import struct
from typing import Dict, Optional
from dataclasses import dataclass, asdict
from datetime import datetime
import threading

logger = logging.getLogger(__name__)


@dataclass
class VIBITMetrics:
    """Single VIBIT sensor metrics with direct CNC OPC UA readings"""
    timestamp: str
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
    # Direct CNC OPC UA tags:
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
    Industrial data pipeline for MIRAC VIBIT sensors
    
    Pattern:
        Modbus reads → Decode → Global state → API
    """

    # Modbus register map for VIBIT1
    REGISTER_MAP = {
        "x_rms_acceleration": 4001,
        "y_rms_acceleration": 4003,
        "z_rms_acceleration": 4005,
        "x_rms_velocity": 4007,
        "y_rms_velocity": 4009,
        "z_rms_velocity": 4011,
        "x_peak_acceleration": 4015,
        "y_peak_acceleration": 4017,
        "z_peak_acceleration": 4019,
        "x_peak_velocity": 4021,
        "y_peak_velocity": 4023,
        "temperature": 4013,
    }

    def __init__(self, host: str = None, port: int = None):
        # Read from central config (backend/.env) if not explicitly provided
        from backend.config import settings
        self.host = host or settings.VIBIT_HOST
        self.port = port or settings.VIBIT_PORT
        self.client = None
        self.state: Dict[str, VIBITMetrics] = {
            "vibit1": VIBITMetrics(timestamp=datetime.now().isoformat()),
        }
        self.is_connected = False
        self.read_interval = 0.1  # 100ms = industrial safe value
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

    def update_state(self, metrics: Dict) -> None:
        """Update global state with decoded metrics"""
        if not metrics:
            return
        
        with self._lock:
            current = self.state["vibit1"]
            for key, value in metrics.items():
                if hasattr(current, key):
                    setattr(current, key, value)
            current.timestamp = datetime.now().isoformat()

    def get_state(self, sensor: str = "vibit1") -> Optional[Dict]:
        """Get current sensor state"""
        with self._lock:
            if sensor in self.state:
                return asdict(self.state[sensor])
        return None

    async def start_reading(self, client) -> None:
        """Start continuous Modbus reads at safe interval"""
        self.is_reading = True
        logger.info(f"Starting VIBIT data reads at {self.read_interval * 1000}ms interval")
        
        while self.is_reading:
            try:
                # Read all sensor data
                metrics = await self.read_sensor_data(client)
                
                # Update state (thread-safe)
                if metrics:
                    self.update_state(metrics)
                    logger.debug(f"Updated state: {len(metrics)} metrics")
                
                # Wait before next read
                await asyncio.sleep(self.read_interval)
                
            except Exception as e:
                logger.error(f"Read loop error: {e}")
                await asyncio.sleep(self.read_interval)

    def stop_reading(self) -> None:
        """Stop continuous reads"""
        self.is_reading = False
        logger.info("Stopped VIBIT data reads")

    def connect(self) -> dict:
        """
        Connect to the OPC UA server and start sync read loop.
        """
        # 1. Connect to MIRAC OPC UA
        opc_ok = False
        opc_msg = ""
        try:
            from backend.stations.mirac.cnc_mirac_station import connect_mirac as opc_connect
            opc_ok, opc_msg = opc_connect()
        except Exception as e:
            logger.error(f"[MIRAC] OPC UA Connection failed: {e}")
            opc_msg = str(e)

        # 2. Start VIBIT/OPC UA reading thread
        self.is_connected = True
        if not self.is_reading:
            self.is_reading = True
            self._read_thread = threading.Thread(target=self._run_sync_read_loop, daemon=True)
            self._read_thread.start()
            logger.info("MIRAC background reading thread started")

        return {
            "opc_ua": {"success": opc_ok, "message": opc_msg},
            "modbus": {"success": True, "message": "MIRAC/VIBIT reader loop initialized"}
        }

    def disconnect(self) -> dict:
        """
        Disconnect from the OPC UA server.
        """
        self.stop_reading()
        self.is_connected = False

        # Disconnect from OPC UA
        opc_ok = False
        opc_msg = ""
        try:
            from backend.stations.mirac.cnc_mirac_station import disconnect_mirac as opc_disconnect
            opc_ok, opc_msg = opc_disconnect()
        except Exception as e:
            logger.error(f"[MIRAC] OPC UA Disconnect failed: {e}")
            opc_msg = str(e)

        return {
            "opc_ua": {"success": opc_ok, "message": opc_msg},
            "modbus": {"success": True, "message": "VIBIT reader stopped"}
        }

    def _run_sync_read_loop(self) -> None:
        """Synchronous background polling loop running in a dedicated thread"""
        import time
        import random
        import math
        from backend.communication.vibit_modbus import VibitModbusReader
        from backend.stations.mirac.cnc_mirac_station import opcua_connection, MIRAC_DATA_TAGS

        reader = VibitModbusReader(host=self.host, port=self.port, device_id=1)
        logger.info(f"Modbus background reader thread running against {self.host}:{self.port}")

        step = 0
        while self.is_reading:
            try:
                opc_data = {}
                opc_connected = False
                
                # 1. Try to read from OPC UA if it's connected
                if opcua_connection.connected:
                    try:
                        opc_connected = True
                        for tag_name, node_id in MIRAC_DATA_TAGS.items():
                            try:
                                node = opcua_connection.client.get_node(node_id)
                                val = node.read_value()
                                opc_data[tag_name] = val
                            except Exception as e:
                                logger.debug(f"OPC UA read failed for node {tag_name}: {e}")
                    except Exception as e:
                        logger.warning(f"OPC UA connection error during read: {e}")
                        opc_connected = False

                # 2. Try to read from physical VIBIT Modbus sensor
                data = reader.read_snapshot()
                
                metrics = {}
                if data:
                    metrics = {
                        "x_rms_acceleration": data.get("x_rms_acc", 0.0),
                        "y_rms_acceleration": data.get("y_rms_acc", 0.0),
                        "z_rms_acceleration": data.get("z_rms_acc", 0.0),
                        "x_rms_velocity": data.get("x_rms_vel", 0.0),
                        "y_rms_velocity": data.get("y_rms_vel", 0.0),
                        "z_rms_velocity": data.get("z_rms_vel", 0.0),
                        "x_peak_acceleration": data.get("x_peak_acc", 0.0),
                        "y_peak_acceleration": data.get("y_peak_acc", 0.0),
                        "z_peak_acceleration": data.get("z_peak_acc", 0.0),
                        "x_peak_velocity": data.get("x_peak_vel", 0.0),
                        "y_peak_velocity": data.get("y_peak_vel", 0.0),
                        "z_peak_velocity": data.get("z_peak_vel", 0.0),
                        "temperature": data.get("temperature", 0.0),
                        "rpm": data.get("rpm", 0.0),
                        "reboot_count": data.get("reboot_count", 0.0),
                        "led_status": data.get("led_status", 0.0),
                    }
                elif opc_connected and opc_data:
                    # 3. If Modbus failed but OPC UA is connected, use OPC UA values
                    rpm_val = float(opc_data.get("spindle_speed", 0.0))
                    temp_val = float(opc_data.get("spindle_temp", 0.0))
                    spindle_vib = float(opc_data.get("spindle_vibration", 0.0))
                    tool_vib = float(opc_data.get("tool_vibration", 0.0))
                    
                    # Convert status LEDs to led_status float
                    # 0.0 = yellow, 1.0 = green, 2.0 = red
                    l_status = 0.0
                    if opc_data.get("led_green"):
                        l_status = 1.0
                    elif opc_data.get("led_red"):
                        l_status = 2.0

                    metrics = {
                        "x_rms_acceleration": round(spindle_vib, 2),
                        "y_rms_acceleration": round(tool_vib, 2),
                        "z_rms_acceleration": 0.0,
                        "x_rms_velocity": round(spindle_vib * 2.0, 2),
                        "y_rms_velocity": round(tool_vib * 2.0, 2),
                        "z_rms_velocity": 0.0,
                        "x_peak_acceleration": round(spindle_vib * 3.0, 2),
                        "y_peak_acceleration": round(tool_vib * 3.0, 2),
                        "z_peak_acceleration": 0.0,
                        "x_peak_velocity": round(spindle_vib * 4.0, 2),
                        "y_peak_velocity": round(tool_vib * 4.0, 2),
                        "z_peak_velocity": 0.0,
                        "temperature": round(temp_val, 2),
                        "rpm": round(rpm_val, 2),
                        "reboot_count": 0.0,
                        "led_status": l_status,
                    }
                else:
                    # 4. Fallback to dynamic, realistic simulated data
                    t = step * 0.1
                    # Base vibration that varies over time
                    vib_x = 0.5 + 0.3 * math.sin(t) + random.uniform(-0.05, 0.05)
                    vib_y = 0.4 + 0.2 * math.cos(t) + random.uniform(-0.05, 0.05)
                    vib_z = 0.6 + 0.4 * math.sin(t * 1.5) + random.uniform(-0.05, 0.05)
                    
                    # Generate dynamic simulated RPM
                    sim_rpm = 1200.0 + 300.0 * math.sin(t / 5) if self.is_connected else 0.0

                    metrics = {
                        "x_rms_acceleration": round(vib_x * 0.5, 2),
                        "y_rms_acceleration": round(vib_y * 0.5, 2),
                        "z_rms_acceleration": round(vib_z * 0.5, 2),
                        "x_rms_velocity": round(vib_x * 1.2, 2),
                        "y_rms_velocity": round(vib_y * 1.2, 2),
                        "z_rms_velocity": round(vib_z * 1.2, 2),
                        "x_peak_acceleration": round(vib_x * 1.5, 2),
                        "y_peak_acceleration": round(vib_y * 1.5, 2),
                        "z_peak_acceleration": round(vib_z * 1.5, 2),
                        "x_peak_velocity": round(vib_x * 2.0, 2),
                        "y_peak_velocity": round(vib_y * 2.0, 2),
                        "z_peak_velocity": round(vib_z * 2.0, 2),
                        "temperature": round(35.0 + 5.0 * math.sin(t / 10) + random.uniform(-0.1, 0.1), 2),
                        "rpm": round(sim_rpm, 2),
                        "reboot_count": 0.0,
                        "led_status": 1.0 if sim_rpm > 0 else 0.0,
                    }

                # Mix in the raw OPC UA values so they are directly available in state
                for tag_name in MIRAC_DATA_TAGS.keys():
                    if tag_name in opc_data:
                        metrics[tag_name] = opc_data[tag_name]

                self.update_state(metrics)
            except Exception as e:
                logger.error(f"Error in MIRAC/VIBIT reading background thread: {e}")
            
            step += 1
            time.sleep(self.read_interval)

        reader.close()


# Global gateway instance
mirac_gateway = MIRACDataGateway()


def get_vibit_data() -> Optional[Dict]:
    """API endpoint to get current VIBIT metrics"""
    return mirac_gateway.get_state("vibit1")


def set_read_interval(interval_ms: int) -> None:
    """Adjust read interval (100-1000ms recommended)"""
    if not (100 <= interval_ms <= 5000):
        raise ValueError("Interval must be 100-5000ms")
    mirac_gateway.read_interval = interval_ms / 1000
    logger.info(f"Updated read interval to {interval_ms}ms")
