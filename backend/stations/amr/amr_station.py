import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime
from backend.stations.amr.amr_tcp_client import AMRTCPClient
from backend.config import settings

logger = logging.getLogger(__name__)

class AMRStation:
    """
    High-level controller for the AMR.
    Maintains state and handles connection lifecycle via AMRTCPClient.
    """
    def __init__(self):
        self.host = settings.AMR_HOST
        self.port = settings.AMR_PORT
        self.client = AMRTCPClient(self.host, self.port, on_message=self._handle_message)
        
        self.state: Dict[str, Any] = {
            "status": "disconnected",
            "last_message": None,
            "last_seen": None,
            "battery": None,
            "position": None,
            "error": None
        }
        self._reconnect_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the AMR station connection and auto-reconnect loop."""
        logger.info("Starting AMR Station...")
        self.state["status"] = "connecting"
        
        if self._reconnect_task is None or self._reconnect_task.done():
            self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def stop(self):
        """Stop the AMR station and close connections."""
        logger.info("Stopping AMR Station...")
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
        await self.client.disconnect()
        self.state["status"] = "disconnected"

    async def _reconnect_loop(self):
        """Background loop to ensure the client stays connected."""
        while True:
            if not self.client.is_connected:
                self.state["status"] = "connecting"
                try:
                    await self.client.connect()
                    self.state["status"] = "connected"
                    self.state["error"] = None
                except Exception as e:
                    self.state["status"] = "error"
                    self.state["error"] = str(e)
                    logger.warning(f"AMR reconnect failed. Retrying in 5s... ({e})")
            
            # Check connection every 5 seconds
            await asyncio.sleep(5.0)

    def _handle_message(self, msg: str):
        """Callback when the TCP client receives a message."""
        self.state["last_message"] = msg
        self.state["last_seen"] = datetime.now().isoformat()
        
        # NOTE: Add custom parsing logic here based on the exact AMR protocol format
        # Example: 
        # if msg.startswith("BATT:"): 
        #     self.state["battery"] = int(msg.split(":")[1])
        
    def get_state(self) -> Dict[str, Any]:
        """Return the current known state of the AMR."""
        # Refresh the status field based on actual socket state
        if self.client.is_connected:
            self.state["status"] = "connected"
        else:
            if self.state["status"] == "connected":
                self.state["status"] = "disconnected"
                
        return self.state

    async def send_command(self, cmd: str) -> bool:
        """Send a command to the AMR."""
        if not self.client.is_connected:
            return False
        return await self.client.send_command(cmd)

# Global singleton instance
amr_station = AMRStation()
