import asyncio
import json
from fastapi import WebSocket
from typing import Set
from backend.stations.mirac.cnc_mirac_station import opcua_connection, MIRAC_DATA_TAGS
from backend.communication.vibit_modbus import VibitModbusReader
from backend.config import settings
import logging

logger = logging.getLogger(__name__)

# VibIT Modbus Configuration — from central settings (override via .env)
VIBIT_HOST    = settings.VIBIT_HOST
VIBIT_PORT    = settings.VIBIT_PORT
VIBIT_UNIT_ID = settings.VIBIT_UNIT_ID

class MiracBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        self.vibit_reader = VibitModbusReader(
            host=VIBIT_HOST,
            port=VIBIT_PORT,
        )
        self._read_count = 0
        self._db_write_interval = 5  # write every 5 reads (5 * 1s = 5 seconds)

    def start_background_logging(self):
        """Start continuous background polling and DB logging"""
        if not self.is_broadcasting:
            self.broadcast_task = asyncio.create_task(self._broadcast_loop())
        
    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Mirac WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket connection"""
        self.active_connections.discard(websocket)
        logger.info(f"Mirac WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def _read_plc_data(self) -> dict:
        """Read current MIRAC PLC data from OPC UA server."""
        if not opcua_connection.connected:
            return {}

        data = {}
        for tag_name, node_id in MIRAC_DATA_TAGS.items():
            try:
                node = opcua_connection.client.get_node(node_id)
                value = node.get_value()
                data[tag_name] = value
            except Exception as e:
                logger.warning(f"Failed to read {tag_name}: {e}")
                data[tag_name] = None

        return data

    async def _read_mirac_data(self) -> dict:
        """Build unified payload for frontend without exposing source details."""
        try:
            plc_data = await self._read_plc_data()
            vibit_data = self.vibit_reader.read_snapshot() or {}

            vibit_temp = vibit_data.get("temperature")
            vibit_rpm = vibit_data.get("rpm")
            vibit_rms_vel = [
                vibit_data.get("x_rms_vel"),
                vibit_data.get("y_rms_vel"),
                vibit_data.get("z_rms_vel"),
            ]
            vibit_peak_vel = [
                vibit_data.get("x_peak_vel"),
                vibit_data.get("y_peak_vel"),
                vibit_data.get("z_peak_vel"),
            ]
            rms_vel_values = [v for v in vibit_rms_vel if v is not None]
            peak_vel_values = [v for v in vibit_peak_vel if v is not None]

            led_status = vibit_data.get("led_status")
            green_on = bool(led_status) if led_status is not None else bool(plc_data.get("led_green", False))
            red_on = (not green_on) if led_status is not None else bool(plc_data.get("led_red", False))
            yellow_on = bool(plc_data.get("led_yellow", False))

            # Store raw values for DB persistence
            self._last_plc_data = plc_data
            self._last_vibit_data = vibit_data
            self._last_connected = opcua_connection.connected

            # Organize data into a clean JSON structure for the frontend
            return {
                "timestamp": asyncio.get_event_loop().time(),
                "status": {
                    "red": red_on,
                    "yellow": yellow_on,
                    "green": green_on,
                    "cycle_start": plc_data.get("cycle_start", False),
                    "cycle_stop": plc_data.get("cycle_stop", False),
                    "pneumatic_chuck": plc_data.get("pneumatic_chuck", False)
                },
                "spindle": {
                    "speed": vibit_rpm if vibit_rpm is not None else plc_data.get("spindle_speed", 0.0),
                    "temperature": vibit_temp if vibit_temp is not None else plc_data.get("spindle_temp", 0.0),
                    "vibration": max(rms_vel_values) if rms_vel_values else plc_data.get("spindle_vibration", 0.0)
                },
                "tool": {
                    "number": plc_data.get("tool_number", 0),
                    "temperature": vibit_temp if vibit_temp is not None else plc_data.get("tool_temp", 0.0),
                    "vibration": max(peak_vel_values) if peak_vel_values else plc_data.get("tool_vibration", 0.0)
                },
                "axes": {
                    "x": {
                        "value": plc_data.get("x_axis_value", 0.0),
                        "feed": plc_data.get("x_axis_feed", 0.0)
                    },
                    "z": {
                        "value": plc_data.get("z_axis_value", 0.0),
                        "feed": plc_data.get("z_axis_feed", 0.0)
                    }
                }
            }
        except Exception as e:
            logger.error(f"Error reading mirac data: {e}")
            return None
    
    async def _broadcast_loop(self):
        """Main broadcast loop - reads and sends data continuously"""
        self.is_broadcasting = True
        logger.info("Mirac continuous broadcast and logging loop started")
        
        try:
            while self.is_broadcasting:
                # Read mirac data
                data = await self._read_mirac_data()
                
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
                        self._write_to_db()
                
                # Wait before next update (10 Hz update rate)
                await asyncio.sleep(0.1)
        
        except asyncio.CancelledError:
            logger.info("Mirac broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Mirac broadcast loop error: {e}")
        finally:
            self.vibit_reader.close()
            self.is_broadcasting = False
            logger.info("Mirac broadcast loop stopped")

    def _write_to_db(self):
        """Write MIRAC PLC + VIBIT readings to database (fire-and-forget)."""
        try:
            from backend.database.sensor_data import write_mirac_plc_reading, write_vibit_reading
            plc = getattr(self, "_last_plc_data", {})
            vibit = getattr(self, "_last_vibit_data", {})
            connected = getattr(self, "_last_connected", False)
            write_mirac_plc_reading(plc, connected)
            write_vibit_reading(vibit)
        except Exception as exc:
            logger.error("[MiracBroadcaster] DB write failed: %s", exc)


# Global broadcaster instance
mirac_broadcaster = MiracBroadcaster()
