import asyncio
import json
from fastapi import WebSocket
from typing import Set
from backend.stations.assembly.hydraulic_station import opcua_connection, HYDRAULIC_DATA_TAGS
from backend.database.db import SessionLocal
from sqlalchemy import text
from backend.core.timezone import ist_now
import logging

logger = logging.getLogger(__name__)

class HydraulicBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        self.last_db_write_time = 0.0
        self._sensor_id_cached = None
        
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
    
    def _get_sensor_id(self) -> str:
        """Resolve sensor UUID for 'assembly' legacy key."""
        if self._sensor_id_cached:
            return self._sensor_id_cached
        
        session = SessionLocal()
        try:
            row = session.execute(
                text("SELECT sensor_id FROM machine_sensors WHERE legacy_key = 'assembly'")
            ).fetchone()
            if row:
                self._sensor_id_cached = str(row[0])
                return self._sensor_id_cached
        except Exception as e:
            logger.error(f"Error fetching sensor_id: {e}")
        finally:
            session.close()
        return None

    async def _log_to_db(self, payload: dict):
        """Write a new telemetry log to assembly_station_data in a background thread."""
        def _write():
            sensor_id = self._get_sensor_id()
            if not sensor_id:
                return
                
            session = SessionLocal()
            try:
                session.execute(
                    text("""
                        INSERT INTO assembly_station_data (
                            time, machine_id, sensor_id,
                            bearing_operation_status, shaft_operation_status,
                            led_red, led_yellow, led_green, safety_curtain_status,
                            displacement_mm
                        )
                        VALUES (
                            :time, 'assembly', :sensor_id,
                            :bearing, :shaft,
                            :red, :yellow, :green, :curtain,
                            :displacement
                        )
                    """),
                    {
                        "time": ist_now(),
                        "sensor_id": sensor_id,
                        "bearing": payload["assembly"]["bearing"],
                        "shaft": payload["assembly"]["shaft"],
                        "red": payload["safety"]["lights"]["red"],
                        "yellow": payload["safety"]["lights"]["orange"],
                        "green": payload["safety"]["lights"]["green"],
                        "curtain": payload["safety"]["curtain"],
                        "displacement": payload["position"]["displacement_mm"]
                    }
                )
                session.commit()
            except Exception as e:
                logger.error(f"Error logging assembly data to DB: {e}")
                session.rollback()
            finally:
                session.close()
                
        await asyncio.to_thread(_write)
    
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
            payload = {
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

            # Throttle DB writes to once every 2.0 seconds
            now = asyncio.get_running_loop().time()
            if now - self.last_db_write_time >= 2.0:
                self.last_db_write_time = now
                asyncio.create_task(self._log_to_db(payload))

            return payload
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
                
                # Wait before next update (500 ms — 2 Hz for responsive motion)
                await asyncio.sleep(0.5)
        
        except asyncio.CancelledError:
            logger.info("Hydraulic broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Hydraulic broadcast loop error: {e}")
        finally:
            self.is_broadcasting = False
            logger.info("Hydraulic broadcast loop stopped")

# Global broadcaster instance
hydraulic_broadcaster = HydraulicBroadcaster()
