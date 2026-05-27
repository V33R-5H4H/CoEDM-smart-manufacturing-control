"""
backend/websockets/base.py — Base WebSocket Broadcaster
========================================================

Abstract base class for all WebSocket broadcasters.
Provides common functionality for managing connections and broadcasting data.
"""

from abc import ABC, abstractmethod
from typing import Set, Dict, Any, Optional
from fastapi import WebSocket
import asyncio
import logging


class BaseBroadcaster(ABC):
    """
    Abstract base class for all WebSocket broadcasters.
    
    Subclasses must implement:
    - _generate_data() - Generate data payload for broadcasting
    """
    
    def __init__(self, name: str):
        """
        Initialize the broadcaster.
        
        Args:
            name: Human-readable broadcaster name
        """
        self.name = name
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task: Optional[asyncio.Task] = None
        self.logger = logging.getLogger(f"websockets.{name.lower()}")
        self._last_broadcast_payload: Dict[str, Any] = {}
    
    async def connect(self, websocket: WebSocket) -> None:
        """
        Register a new WebSocket connection.
        
        Args:
            websocket: The WebSocket connection
        """
        await websocket.accept()
        self.active_connections.add(websocket)
        self.logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
        
        # Send last known state to new client
        if self._last_broadcast_payload:
            try:
                await websocket.send_json({
                    "type": "snapshot",
                    "data": self._last_broadcast_payload
                })
            except Exception as e:
                self.logger.warning(f"Could not send initial snapshot to new client: {e}")
        
        # Start broadcasting if this is the first connection
        if not self.is_broadcasting:
            self.is_broadcasting = True
            self.broadcast_task = asyncio.create_task(self._broadcast_loop())
    
    def disconnect(self, websocket: WebSocket) -> None:
        """
        Unregister a WebSocket connection.
        
        Args:
            websocket: The WebSocket connection
        """
        self.active_connections.discard(websocket)
        self.logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
        
        # Stop broadcasting if no connections remain
        if len(self.active_connections) == 0 and self.is_broadcasting:
            self.is_broadcasting = False
            if self.broadcast_task:
                self.broadcast_task.cancel()
                self.broadcast_task = None
    
    @abstractmethod
    async def _generate_data(self) -> Dict[str, Any]:
        """
        Generate data payload for broadcasting.
        
        Must be implemented by subclasses.
        
        Returns:
            Dict with data to broadcast
        """
        pass
    
    async def _broadcast_loop(self) -> None:
        """
        Main broadcast loop - sends data to all connected clients.
        
        Override this method for custom broadcast logic.
        """
        while self.is_broadcasting:
            try:
                data = await self._generate_data()
                self._last_broadcast_payload = data
                
                # Broadcast to all connected clients
                disconnected = set()
                for connection in self.active_connections:
                    try:
                        await connection.send_json({
                            "type": "delta",
                            "data": data
                        })
                    except Exception as e:
                        self.logger.warning(f"Failed to send broadcast: {e}")
                        disconnected.add(connection)
                
                # Remove disconnected clients
                for connection in disconnected:
                    self.disconnect(connection)
                
                # Wait before next broadcast (1 second default)
                await asyncio.sleep(1)
                
            except asyncio.CancelledError:
                self.logger.info("Broadcast loop cancelled")
                break
            except Exception as e:
                self.logger.error(f"Broadcast loop error: {e}")
                await asyncio.sleep(1)
    
    async def broadcast_snapshot(self, data: Dict[str, Any]) -> None:
        """
        Broadcast a full state snapshot to all connected clients.
        
        Args:
            data: Full state data to broadcast
        """
        self._last_broadcast_payload = data
        
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json({
                    "type": "snapshot",
                    "data": data
                })
            except Exception as e:
                self.logger.warning(f"Failed to send snapshot: {e}")
                disconnected.add(connection)
        
        for connection in disconnected:
            self.disconnect(connection)
    
    def get_connection_count(self) -> int:
        """
        Get the number of active connections.
        
        Returns:
            Number of active connections
        """
        return len(self.active_connections)