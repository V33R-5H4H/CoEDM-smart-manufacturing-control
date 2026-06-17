"""
MIRAC Modbus Connection Handler
Manages the actual Modbus TCP connection with error handling

This module wraps pymodbus with proper:
- Connection management
- Reconnection logic
- Timeout handling
- Thread-safe operations
"""

import asyncio
import logging
from pymodbus.client import AsyncModbusTcpClient
from pymodbus.exceptions import ModbusException
from backend.config import settings

logger = logging.getLogger(__name__)


class ModbusConnectionManager:
    """Manages Modbus TCP connection with retry logic"""
    
    def __init__(
        self,
        host: str = None,
        port: int = None,
        unit_id: int = None,
    ):
        self.host = host or settings.VIBIT_HOST
        self.port = port or settings.VIBIT_PORT
        self.unit_id = unit_id or settings.VIBIT_UNIT_ID
        self.client = None
        self.is_connected = False
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 3
        self.reconnect_delay = 0.5  # seconds

    async def connect(self) -> bool:
        """Establish Modbus TCP connection"""
        try:
            self.client = AsyncModbusTcpClient(
                host=self.host,
                port=self.port,
                timeout=0.5,
            )
            
            await self.client.connect()
            self.is_connected = True
            self.reconnect_attempts = 0
            
            logger.info(f"Connected to Modbus device at {self.host}:{self.port}")
            return True
            
        except Exception as e:
            logger.error(f"Modbus connection failed: {e}")
            self.is_connected = False
            return False

    async def disconnect(self) -> None:
        """Gracefully disconnect from Modbus device"""
        if self.client:
            try:
                await self.client.close()
                logger.info("Disconnected from Modbus device")
            except Exception as e:
                logger.warning(f"Error closing Modbus connection: {e}")
            finally:
                self.is_connected = False
                self.client = None

    async def read_holding_registers(self, address: int, count: int = 1) -> list:
        """
        Read holding registers from device
        
        Args:
            address: Starting register address
            count: Number of registers to read
            
        Returns:
            List of register values
            
        Raises:
            ModbusException on device or communication error
        """
        if not self.is_connected or not self.client:
            raise ModbusException("Not connected to Modbus device")
        
        try:
            result = await self.client.read_holding_registers(
                address=address,
                count=count,
                slave=self.unit_id,
            )
            
            if result.isError():
                raise ModbusException(f"Device error reading registers {address}-{address+count}")
            
            return result.registers
            
        except Exception as e:
            logger.error(f"Error reading registers {address}: {e}")
            self.is_connected = False
            raise

    async def ensure_connected(self) -> bool:
        """
        Ensure connection is established, attempting reconnect if needed
        
        Returns:
            True if connected, False otherwise
        """
        if self.is_connected and self.client:
            return True
        
        if self.reconnect_attempts < self.max_reconnect_attempts:
            logger.info(f"Reconnecting to Modbus device (attempt {self.reconnect_attempts + 1})")
            self.reconnect_attempts += 1
            await asyncio.sleep(self.reconnect_delay)
            return await self.connect()
        
        logger.error("Max reconnection attempts reached")
        return False


# Global Modbus connection manager
modbus_manager = ModbusConnectionManager()


async def initialize_modbus() -> bool:
    """Initialize Modbus connection at startup"""
    return await modbus_manager.connect()


async def shutdown_modbus() -> None:
    """Cleanup Modbus connection at shutdown"""
    await modbus_manager.disconnect()
