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

    async def start(self) -> bool:
        """Attempt connection to AMR. Returns True if actually connected, False otherwise."""
        if self.client.is_connected:
            logger.info("AMR Station already connected.")
            self.state["status"] = "connected"
            self.state["error"] = None
            return True

        logger.info("Starting AMR Station...")
        self.state["status"] = "connecting"

        # Cancel any stale reconnect loop first
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass
            self._reconnect_task = None

        # Attempt the first connection synchronously so the caller gets real feedback
        try:
            await self.client.connect()
            self.state["status"] = "connected"
            self.state["error"] = None
            logger.info("AMR Station connected.")
        except Exception as e:
            self.state["status"] = "error"
            self.state["error"] = str(e)
            logger.error(f"AMR Station initial connect failed: {e}")
            return False

        # Start background reconnect loop only after initial success
        self._reconnect_task = asyncio.create_task(self._reconnect_loop())
        return True

    async def stop(self):
        """Stop the AMR station and close connections."""
        logger.info("Stopping AMR Station...")
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass
        await self.client.disconnect()
        self.state["status"] = "disconnected"

    async def _reconnect_loop(self):
        """Background loop: reconnects if connection drops after initial connect."""
        while True:
            await asyncio.sleep(5.0)
            if not self.client.is_connected:
                self.state["status"] = "connecting"
                try:
                    await self.client.connect()
                    self.state["status"] = "connected"
                    self.state["error"] = None
                    logger.info("AMR reconnected successfully.")
                except Exception as e:
                    self.state["status"] = "error"
                    self.state["error"] = str(e)
                    logger.warning(f"AMR reconnect failed. Retrying in 5s... ({e})")

    async def _handle_message(self, msg: str):
        """Callback when the TCP client receives a message."""
        self.state["last_message"] = msg
        self.state["last_seen"] = datetime.now().isoformat()
        
        # Parse based on actual AMR protocol format
        if msg.startswith("POSE,"):
            try:
                parts = msg.split(",")
                self.state["position"] = {
                    "x": float(parts[1]),
                    "y": float(parts[2])
                }
            except Exception as e:
                logger.error(f"Error parsing POSE message {msg}: {e}")
        elif msg == "ACCEPTED":
            self.state["status"] = "navigating"
            self.state["error"] = None
        elif msg == "SUCCESS":
            self.state["status"] = "idle"
            self.state["error"] = None
        elif msg == "REJECTED":
            self.state["status"] = "idle"
            self.state["error"] = "Goal rejected by Nav2"
        elif msg.startswith("ERROR:"):
            self.state["status"] = "error"
            self.state["error"] = msg.split(":", 1)[1] if ":" in msg else msg
        elif msg == "BUSY":
            self.state["status"] = "busy"
            self.state["error"] = "AMR is busy with another goal"

        from backend.websockets.amr_broadcaster import amr_ws_manager
        await amr_ws_manager.broadcast_state(self.get_state())
        
    def get_state(self) -> Dict[str, Any]:
        """Return the current known state of the AMR."""
        # Refresh the status field based on actual socket state
        if self.client.is_connected:
            # Keep navigating/busy state if it's already set
            if self.state["status"] not in ["navigating", "busy", "idle"]:
                self.state["status"] = "connected"
        else:
            self.state["status"] = "disconnected"
                
        return self.state

    async def send_command(self, cmd: str) -> bool:
        """Send a command to the AMR over TCP.
        
        The robot node (tcp_nav_node.py) accepts full station names directly:
        HOME, ASRS, MIRAC, TRIAC, ASSEMBLY, TESTING, INSPECTION
        """
        if not self.client.is_connected:
            return False
        
        # Normalize: strip whitespace, uppercase, ensure newline terminator
        clean_cmd = cmd.strip().upper()
        if not clean_cmd.endswith("\n"):
            clean_cmd += "\n"
        return await self.client.send_command(clean_cmd)

# Global singleton instance
amr_station = AMRStation()
