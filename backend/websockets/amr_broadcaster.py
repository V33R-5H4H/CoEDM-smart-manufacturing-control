import logging
from typing import Set
from fastapi import WebSocket
import orjson

logger = logging.getLogger(__name__)

class AMRWebSocketManager:
    """
    Manages WebSocket connections for real-time AMR status and pose broadcasting.
    """
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        logger.info("[AMR WebSocket] Manager initialized")

    async def connect(self, websocket: WebSocket):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"[AMR WebSocket] Client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket connection."""
        self.active_connections.discard(websocket)
        logger.info(f"[AMR WebSocket] Client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast_state(self, state: dict):
        """Broadcast AMR state changes to all connected WebSocket clients."""
        if not self.active_connections:
            return

        message = orjson.dumps({
            "type": "amr_state",
            "payload": state
        }).decode("utf-8")

        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.debug(f"[AMR WebSocket] Send failed: {e}")
                disconnected.add(connection)

        for conn in disconnected:
            self.disconnect(conn)

# Global singleton instance
amr_ws_manager = AMRWebSocketManager()
