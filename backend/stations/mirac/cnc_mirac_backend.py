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
    """Single VIBIT sensor metrics"""
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
            "vibit2": VIBITMetrics(timestamp=datetime.now().isoformat()),
            "vibit3": VIBITMetrics(timestamp=datetime.now().isoformat()),
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


# Global gateway instance
mirac_gateway = MIRACDataGateway()


def get_vibit_data(sensor: str = None) -> Optional[Dict]:
    """API endpoint to get current VIBIT metrics"""
    return mirac_gateway.get_state(sensor)


def set_read_interval(interval_ms: int) -> None:
    """Adjust read interval (100-1000ms recommended)"""
    if not (100 <= interval_ms <= 5000):
        raise ValueError("Interval must be 100-5000ms")
    mirac_gateway.read_interval = interval_ms / 1000
    logger.info(f"Updated read interval to {interval_ms}ms")
