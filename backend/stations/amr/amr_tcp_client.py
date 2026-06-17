import asyncio
import logging
from typing import Callable, Optional

logger = logging.getLogger(__name__)

class AMRTCPClient:
    """
    Persistent asynchronous TCP Client for connecting to the AMR.
    Continuously listens for incoming data and triggers callbacks.
    """
    def __init__(self, host: str, port: int, on_message: Callable[[str], None] = None):
        self.host = host
        self.port = port
        self.on_message = on_message
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.is_connected = False
        self._listen_task: Optional[asyncio.Task] = None

    async def connect(self):
        """Establish connection and start listener task."""
        try:
            self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
            self.is_connected = True
            logger.info(f"AMRTCPClient connected to {self.host}:{self.port}")
            
            # Start background listener
            if self._listen_task is None or self._listen_task.done():
                self._listen_task = asyncio.create_task(self._listen_loop())
                
        except Exception as e:
            logger.error(f"AMRTCPClient failed to connect to {self.host}:{self.port}: {e}")
            self.is_connected = False
            raise e

    async def disconnect(self):
        """Close connection and stop listener."""
        self.is_connected = False
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception as e:
                logger.warning(f"Error closing AMRTCPClient writer: {e}")
        
        if self._listen_task and not self._listen_task.done():
            self._listen_task.cancel()
            
        logger.info("AMRTCPClient disconnected")

    async def send_command(self, cmd: str):
        """Send a string command to the AMR."""
        if not self.is_connected or not self.writer:
            logger.error("AMRTCPClient: Cannot send command, not connected")
            return False
            
        try:
            self.writer.write(cmd.encode('utf-8'))
            await self.writer.drain()
            logger.debug(f"AMRTCPClient sent: {cmd}")
            return True
        except Exception as e:
            logger.error(f"AMRTCPClient send error: {e}")
            self.is_connected = False
            return False

    async def _listen_loop(self):
        """Continuously read from the socket."""
        while self.is_connected and self.reader:
            try:
                data = await self.reader.read(1024)
                if not data:
                    logger.warning("AMRTCPClient: Connection closed by remote host")
                    self.is_connected = False
                    break
                    
                msg = data.decode('utf-8', errors='ignore').strip()
                if msg:
                    logger.debug(f"AMRTCPClient received: {msg}")
                    if self.on_message:
                        if asyncio.iscoroutinefunction(self.on_message):
                            await self.on_message(msg)
                        else:
                            self.on_message(msg)
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"AMRTCPClient read error: {e}")
                self.is_connected = False
                break
                
        # Clean up
        await self.disconnect()
