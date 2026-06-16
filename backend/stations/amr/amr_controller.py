"""
AMR Connection Handler
Manages the actual raw TCP socket connection with the Autonomous Mobile Robot.

Features:
- Connection management
- Reconnection logic
- Timeout handling
- Asynchronous operations
"""

import asyncio
import logging
from backend.config import settings

logger = logging.getLogger(__name__)

class AmrConnectionManager:
    """Manages raw TCP socket connection to AMR with retry logic"""
    
    def __init__(
        self,
        host: str = None,
        port: int = None,
    ):
        self.host = host or settings.AMR_HOST
        self.port = port or settings.AMR_PORT
        self.reader = None
        self.writer = None
        self.is_connected = False
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 3
        self.reconnect_delay = 1.0  # seconds

    async def connect(self) -> bool:
        """Establish raw TCP connection to the AMR"""
        try:
            self.reader, self.writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=5.0
            )
            self.is_connected = True
            self.reconnect_attempts = 0
            
            logger.info(f"Connected to AMR at {self.host}:{self.port}")
            return True
            
        except Exception as e:
            logger.error(f"AMR connection failed: {e}")
            self.is_connected = False
            return False

    async def disconnect(self) -> None:
        """Gracefully disconnect from the AMR"""
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
                logger.info("Disconnected from AMR")
            except Exception as e:
                logger.warning(f"Error closing AMR connection: {e}")
            finally:
                self.is_connected = False
                self.writer = None
                self.reader = None

    async def ensure_connected(self) -> bool:
        """
        Ensure connection is established, attempting reconnect if needed
        """
        if self.is_connected and self.writer:
            return True
        
        if self.reconnect_attempts < self.max_reconnect_attempts:
            logger.info(f"Reconnecting to AMR (attempt {self.reconnect_attempts + 1})")
            self.reconnect_attempts += 1
            await asyncio.sleep(self.reconnect_delay)
            return await self.connect()
        
        logger.error("Max reconnection attempts reached for AMR")
        return False

    async def send_dispatch_command(self, station: str) -> tuple[bool, str]:
        """
        Send a dispatch command to the AMR.
        """
        if not await self.ensure_connected():
            return False, "Failed to connect to AMR."
            
        try:
            logger.info(f"[AMR] Dispatching to station {station}...")
            self.writer.write(station.encode())
            await self.writer.drain()
            return True, f"AMR dispatched to station {station} successfully."
        except Exception as e:
            logger.error(f"Error sending dispatch command to AMR: {e}")
            self.is_connected = False
            return False, str(e)


# Global AMR connection manager
amr_manager = AmrConnectionManager()


async def dispatch_amr_to_station(station: str) -> tuple[bool, str]:
    """Helper function to dispatch using the global manager"""
    if station not in ["A", "B", "C"]:
        return False, "Invalid station. Must be A, B, or C."
        
    return await amr_manager.send_dispatch_command(station)
