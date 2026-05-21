"""
Hydraulic Data WebSocket Broadcaster
Continuously streams hydraulic system data to connected clients
"""

import asyncio
import json
from fastapi import WebSocket
from typing import Set
from backend.stations.assembly.hydraulic_station import opcua_connection, HYDRAULIC_DATA_TAGS
import logging

logger = logging.getLogger(__name__)

class HydraulicBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        self._read_count = 0
        self._db_write_interval = 10  # write every 10 reads (10 * 500ms = 5 seconds)
        
    def start_background_logging(self):
        """Start continuous background polling and DB logging"""
        if not self.is_broadcasting:
            self.broadcast_task = asyncio.create_task(self._broadcast_loop())
            
    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Hydraulic WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket connection"""
        self.active_connections.discard(websocket)
        logger.info(f"Hydraulic WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def _read_hydraulic_data(self) -> dict:
        """Read current hydraulic data from OPC UA server.

        Uses opcua_connection.get_node() which correctly wraps the tag string
        with the required 'ns=4;s=' namespace prefix, consistent with all other
        station modules in this project.
        """
        try:
            if not opcua_connection.connected:
                # Broadcast explicit offline state so the frontend can reflect
                # the disconnected condition rather than going silent.
                return self._disconnected_payload()

            data = {}
            for tag_name, node_id in HYDRAULIC_DATA_TAGS.items():
                try:
                    # get_node() wraps node_id with ns=4;s= — do NOT call
                    # opcua_connection.client.get_node() directly here.
                    node = opcua_connection.get_node(node_id)
                    value = node.get_value()
                    data[tag_name] = value
                except Exception as e:
                    logger.warning(f"Failed to read {tag_name}: {e}")
                    data[tag_name] = None

            # Map to frontend format
            return {
                "connected": True,
                "timestamp": asyncio.get_running_loop().time(),
                "assembly": {
                    "bearing": bool(data.get("bearing_operation") or False),
                    "shaft":   bool(data.get("shaft_operation") or False),
                },
                "position": {
                    "displacement_mm": float(data.get("displacement_mm") or 0.0),
                },
                "vice": {
                    "open":  bool(data.get("vice_open") or False),
                    "close": bool(data.get("vice_close") or False),
                },
                "safety": {
                    "buzzer":  bool(data.get("buzzer") or False),
                    "curtain": bool(data.get("safety_curtain") or False),
                    "lights": {
                        "red":    bool(data.get("light_red") or False),
                        "orange": bool(data.get("light_orange") or False),
                        "green":  bool(data.get("light_green") or False),
                    }
                }
            }
        except Exception as e:
            logger.error(f"Error reading hydraulic data: {e}")
            return self._disconnected_payload()

    def _disconnected_payload(self) -> dict:
        """Return a safe all-false payload flagging the connection as down."""
        return {
            "connected": False,
            "timestamp": 0,
            "assembly": {"bearing": False, "shaft": False},
            "position": {"displacement_mm": 0.0},
            "vice": {"open": False, "close": False},
            "safety": {
                "buzzer": False,
                "curtain": False,
                "lights": {"red": False, "orange": False, "green": False},
            },
        }
    
    async def _broadcast_loop(self):
        """Main broadcast loop - reads and sends data continuously"""
        self.is_broadcasting = True
        logger.info("Hydraulic continuous broadcast and logging loop started")
        
        try:
            while self.is_broadcasting:
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

                    # Persist to database every N reads
                    self._read_count += 1
                    if self._read_count >= self._db_write_interval:
                        self._read_count = 0
                        self._write_to_db(data)
                
                # Wait before next update (500 ms — 2 Hz for responsive motion)
                await asyncio.sleep(0.5)
        
        except asyncio.CancelledError:
            logger.info("Hydraulic broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Hydraulic broadcast loop error: {e}")
        finally:
            self.is_broadcasting = False
            logger.info("Hydraulic broadcast loop stopped")

    def _write_to_db(self, data: dict):
        """Write hydraulic reading to database (fire-and-forget)."""
        try:
            from backend.database.sensor_data import write_hydraulic_reading
            assembly = data.get("assembly", {})
            position = data.get("position", {})
            vice = data.get("vice", {})
            safety = data.get("safety", {})
            lights = safety.get("lights", {})
            write_hydraulic_reading({
                "bearing": assembly.get("bearing", False),
                "shaft": assembly.get("shaft", False),
                "displacement_mm": position.get("displacement_mm", 0.0),
                "vice_open": vice.get("open", False),
                "vice_close": vice.get("close", False),
                "buzzer": safety.get("buzzer", False),
                "curtain": safety.get("curtain", False),
                "lights": lights,
                "connected": data.get("connected", False),
            })
        except Exception as exc:
            logger.error("[HydraulicBroadcaster] DB write failed: %s", exc)


# Global broadcaster instance
hydraulic_broadcaster = HydraulicBroadcaster()
