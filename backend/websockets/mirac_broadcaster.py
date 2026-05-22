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
<<<<<<< HEAD
<<<<<<< HEAD
        self.vibit_reader_1 = VibitModbusReader(
            host=settings.VIBIT_HOST,
            port=settings.VIBIT_PORT,
            device_id=settings.VIBIT_UNIT_ID,
        )
        self.vibit_reader_2 = VibitModbusReader(
            host=settings.VIBIT_HOST,
            port=settings.VIBIT_PORT,
            device_id=settings.VIBIT_UNIT_ID_2,
        )
        self.vibit_reader_3 = VibitModbusReader(
            host=settings.VIBIT_HOST,
            port=settings.VIBIT_PORT,
            device_id=settings.VIBIT_UNIT_ID_3,
=======
        self.vibit_reader = VibitModbusReader(
            host=VIBIT_HOST,
            port=VIBIT_PORT,
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849
=======
        self.vibit_reader = VibitModbusReader(
            host=VIBIT_HOST,
            port=VIBIT_PORT,
            device_id=VIBIT_UNIT_ID,
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)
        )
        
    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Mirac WebSocket connected. Total connections: {len(self.active_connections)}")
        
        # Start broadcasting if this is the first connection
        if not self.is_broadcasting:
            self.broadcast_task = asyncio.create_task(self._broadcast_loop())
    
    def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket connection"""
        self.active_connections.discard(websocket)
        logger.info(f"Mirac WebSocket disconnected. Total connections: {len(self.active_connections)}")
        
        # Stop broadcasting if no connections remain
        if len(self.active_connections) == 0 and self.is_broadcasting:
            self.is_broadcasting = False
            if self.broadcast_task:
                self.broadcast_task.cancel()
    
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
<<<<<<< HEAD
<<<<<<< HEAD
            
            # Read all three VibIT snapshots
            vibit1_data = self.vibit_reader_1.read_snapshot() or {}
            vibit2_data = self.vibit_reader_2.read_snapshot() or {}
            vibit3_data = self.vibit_reader_3.read_snapshot() or {}
=======
            vibit_data = self.vibit_reader.read_snapshot(device_id=VIBIT_UNIT_ID) or {}
>>>>>>> ad0b676e499a57d5639863fde203e68cf7b7b849
=======
            vibit_data = self.vibit_reader.read_snapshot() or {}
>>>>>>> parent of 2ea1e21 (feat: implement backend web-socket broadcasters and sensor monitoring for ASRS and MIRAC stations)

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
        logger.info("Mirac broadcast loop started")
        
        try:
            while self.is_broadcasting and len(self.active_connections) > 0:
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
                
                # Wait before next update (1 Hz update rate)
                await asyncio.sleep(1.0)
        
        except asyncio.CancelledError:
            logger.info("Mirac broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Mirac broadcast loop error: {e}")
        finally:
            self.vibit_reader.close()
            self.is_broadcasting = False
            logger.info("Mirac broadcast loop stopped")

# Global broadcaster instance
mirac_broadcaster = MiracBroadcaster()
