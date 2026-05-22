from fastapi import WebSocket, WebSocketDisconnect
from typing import Set
import json
import logging
import asyncio

class LEDWebSocketManager:
    """
    Manages WebSocket connections for real-time ASRS status broadcasting.
    
    This manager:
    - Maintains a set of active WebSocket connections
    - Broadcasts LED and shuttle state changes to all connected clients
    - Handles connection/disconnection gracefully
    - Cleans up dead connections automatically
    """
    
    def __init__(self):
        # Set of active WebSocket connections
        self.active_connections: Set[WebSocket] = set()
        logging.info("[ASRS WebSocket] Manager initialized")
    
    async def connect(self, websocket: WebSocket):
        """
        Accept and register a new WebSocket connection.
        
        Args:
            websocket: WebSocket connection to register
        """
        await websocket.accept()
        self.active_connections.add(websocket)
        logging.info(f"[ASRS WebSocket] Client connected. Total clients: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """
        Unregister a WebSocket connection.
        
        Args:
            websocket: WebSocket connection to remove
        """
        self.active_connections.discard(websocket)
        logging.info(f"[ASRS WebSocket] Client disconnected. Total clients: {len(self.active_connections)}")
    
    async def broadcast_led_change(self, box_id: str, active: bool, prev: bool):
        """
        Broadcast LED state change to all connected WebSocket clients.
        
        Args:
            box_id: Box identifier (e.g., "A1")
            active: Current LED state (True=ON, False=OFF)
            prev: Previous LED state (for edge detection)
        """
        # Log the LED transition
        transition = "False → True" if not prev and active else "True → False" if prev and not active else f"{prev} → {active}"
        logging.info(f"[WS BROADCAST] LED {box_id} {transition} | Clients: {len(self.active_connections)}")
        
        if not self.active_connections:
            return
        
        # Prepare message with typed envelope
        message = json.dumps({
            "type": "led",
            "payload": {
                "box_id": box_id,
                "active": active
            }
        })
        
        await self._send_to_all(message)
    
    async def broadcast_shuttle_state(self, row: int, column: str, state: str, command: str = None):
        """
        Broadcast shuttle state to all connected WebSocket clients.
        
        Args:
            row: Shuttle row position (1-7)
            column: Shuttle column position (A-E)
            state: Shuttle state (idle|busy|moving|error)
            command: Active command being executed (optional)
        """
        logging.info(f"[WS BROADCAST] Shuttle {column}{row} state={state} | Clients: {len(self.active_connections)}")
        
        if not self.active_connections:
            return
        
        # Prepare message with typed envelope
        message = json.dumps({
            "type": "shuttle",
            "payload": {
                "row": row,
                "column": column,
                "state": state,
                "command": command
            }
        })
        
        await self._send_to_all(message)
    
    async def _send_to_all(self, message: str):
        """
        Internal method to send message to all clients and clean up dead connections.
        
        Args:
            message: JSON string message to broadcast
        """
        disconnected = set()
        
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logging.debug(f"[ASRS WebSocket] Send failed (client disconnected): {e}")
                disconnected.add(connection)
        
        # Clean up dead connections
        for conn in disconnected:
            self.disconnect(conn)
    
    async def send_snapshot(self, websocket: WebSocket, led_states: dict, safety_curtain: bool = False):
        """
        Send current state of all LEDs to a specific client (initial sync).
        
        Args:
            websocket: WebSocket connection to send to
            led_states: Dictionary of all LED states
            safety_curtain: Current safety curtain status
        """
        message = json.dumps({
            "type": "snapshot",
            "states": led_states,
            "safety": {
                "curtain": safety_curtain
            }
        })
        await websocket.send_text(message)
        logging.info(f"[ASRS WebSocket] Sent snapshot (with safety={safety_curtain}) to client")

    async def broadcast_safety_change(self, active: bool):
        """
        Broadcast safety curtain state change to all connected WebSocket clients.
        
        Args:
            active: Current safety curtain active status
        """
        logging.info(f"[WS BROADCAST] Safety Curtain active={active} | Clients: {len(self.active_connections)}")
        
        if not self.active_connections:
            return
        
        # Prepare message with typed envelope
        message = json.dumps({
            "type": "safety",
            "payload": {
                "curtain": active
            }
        })
        
        await self._send_to_all(message)

# Global singleton instance for ASRS WebSocket management
led_ws_manager = LEDWebSocketManager()
