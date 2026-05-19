"""
Hydraulic Data WebSocket Broadcaster
Continuously streams hydraulic system data to connected clients
"""

import asyncio
import json
from fastapi import WebSocket
from typing import Set
from backend.stations.hydraulic_station import opcua_connection, HYDRAULIC_DATA_TAGS
import logging

logger = logging.getLogger(__name__)

class HydraulicBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        
    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Hydraulic WebSocket connected. Total connections: {len(self.active_connections)}")
        
        # Start broadcasting if this is the first connection
        if not self.is_broadcasting:
            self.broadcast_task = asyncio.create_task(self._broadcast_loop())
    
    def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket connection"""
        self.active_connections.discard(websocket)
        logger.info(f"Hydraulic WebSocket disconnected. Total connections: {len(self.active_connections)}")
        
        # Stop broadcasting if no connections remain
        if len(self.active_connections) == 0 and self.is_broadcasting:
            self.is_broadcasting = False
            if self.broadcast_task:
                self.broadcast_task.cancel()
    
    async def _read_hydraulic_data(self) -> dict:
        """Read current hydraulic data from OPC UA server"""
        try:
            if not opcua_connection.connected:
                return None
            
            data = {}
            for tag_name, node_id in HYDRAULIC_DATA_TAGS.items():
                try:
                    node = opcua_connection.client.get_node(node_id)  # node_id is already a full tag string
                    value = node.get_value()
                    data[tag_name] = value
                except Exception as e:
                    logger.warning(f"Failed to read {tag_name}: {e}")
                    data[tag_name] = None
            
            # Map to frontend format
            return {
                "timestamp": asyncio.get_event_loop().time(),
                "assembly": {
                    "bearing": data.get("bearing_operation", False),
                    "shaft": data.get("shaft_operation", False),
                },
                "position": {
                    "displacement_mm": data.get("displacement_mm", 0.0),
                },
                "vice": {
                    "open": data.get("vice_open", False),
                    "close": data.get("vice_close", False),
                },
                "safety": {
                    "buzzer": data.get("buzzer", False),
                    "curtain": data.get("safety_curtain", False),
                    "lights": {
                        "red": data.get("light_red", False),
                        "orange": data.get("light_orange", False),
                        "green": data.get("light_green", False),
                    }
                }
            }
        except Exception as e:
            logger.error(f"Error reading hydraulic data: {e}")
            return None
    
    async def _broadcast_loop(self):
        """Main broadcast loop - reads and sends data continuously"""
        self.is_broadcasting = True
        logger.info("Hydraulic broadcast loop started")
        
        try:
            while self.is_broadcasting and len(self.active_connections) > 0:
                # Read hydraulic data
                data = await self._read_hydraulic_data()
                
                if data:
                    # Broadcast to all connected clients
                    message = json.dumps(data)
                    disconnected = set()
                    
                    for connection in self.active_connections:
                        try:
                            await connection.send_text(message)
                        except Exception as e:
                            logger.error(f"Error sending to client: {e}")
                            disconnected.add(connection)
                    
                    # Clean up disconnected clients
                    for conn in disconnected:
                        self.disconnect(conn)
                
                # Wait before next update (1 Hz update rate)
                await asyncio.sleep(1.0)
        
        except asyncio.CancelledError:
            logger.info("Hydraulic broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Hydraulic broadcast loop error: {e}")
        finally:
            self.is_broadcasting = False
            logger.info("Hydraulic broadcast loop stopped")

# Global broadcaster instance
hydraulic_broadcaster = HydraulicBroadcaster()
