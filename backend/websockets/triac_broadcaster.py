import asyncio
import json
import time
from fastapi import WebSocket
from typing import Set
from backend.stations.triac.cnc_triac_station import opcua_connection, TRIAC_DATA_TAGS
from backend.communication.vibit_modbus import VibitModbusReader
from backend.config import settings
import logging

logger = logging.getLogger(__name__)

class TriacBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        self.vibit_reader1 = VibitModbusReader(
            host=settings.TRIAC_VIBIT_HOST,
            port=settings.TRIAC_VIBIT_PORT,
            device_id=settings.TRIAC_VIBIT_UNIT_ID,
        )
        self.vibit_reader2 = VibitModbusReader(
            host=settings.TRIAC_VIBIT_HOST,
            port=settings.TRIAC_VIBIT_PORT,
            device_id=settings.TRIAC_VIBIT_UNIT_ID_2,
        )
        
    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Triac WebSocket connected. Total connections: {len(self.active_connections)}")
        
        # Start broadcasting if this is the first connection
        if not self.is_broadcasting:
            self.broadcast_task = asyncio.create_task(self._broadcast_loop())
    
    def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket connection"""
        self.active_connections.discard(websocket)
        logger.info(f"Triac WebSocket disconnected. Total connections: {len(self.active_connections)}")
        
        # Stop broadcasting if no connections remain
        if len(self.active_connections) == 0 and self.is_broadcasting:
            self.is_broadcasting = False
            if self.broadcast_task:
                self.broadcast_task.cancel()
    
    async def _read_plc_data(self) -> dict:
        """Read current Triac PLC data from OPC UA server."""
        if not opcua_connection.connected:
            return {}

        data = {}
        for tag_name, node_id in TRIAC_DATA_TAGS.items():
            try:
                node = opcua_connection.client.get_node(node_id)
                value = node.get_value()
                data[tag_name] = value
                
                from backend.database.sensor_data import queue_opcua_reading
                queue_opcua_reading("triac", tag_name, value)
            except Exception as e:
                logger.warning(f"Failed to read {tag_name}: {e}")
                data[tag_name] = None

        return data

    async def _read_triac_data(self) -> dict:
        """Build unified payload for frontend."""
        try:
            plc_data = await self._read_plc_data()
            
            # Check if OPC UA PLC connection is offline and simulate if so
            is_simulated_plc = False
            if not plc_data:
                is_simulated_plc = True
                t = time.time()
                # Simulate 3-axis movement
                plc_data = {
                    "x_pos": 100 + 50 * __import__("math").sin(t * 0.5),
                    "y_pos": 50 + 25 * __import__("math").cos(t * 0.5),
                    "z_pos": 50 + 25 * __import__("math").sin(t * 1.0),
                    "spindle_speed": 1200 if (t % 30) > 5 else 0,
                    "tool_number": 4,
                    "error_code": 0
                }

            # Read VIBIT sensor data
            vibit1_data = await self.vibit_reader1.read_all_metrics()
            vibit2_data = await self.vibit_reader2.read_all_metrics()
            
            is_simulated_vibit = False
            
            t = time.time()
            if not vibit1_data:
                is_simulated_vibit = True
                vibit1_data = {
                    "x_rms_velocity": 2.5 + 0.5 * __import__("math").sin(t * 5),
                    "y_rms_velocity": 2.1 + 0.4 * __import__("math").cos(t * 6),
                    "z_rms_velocity": 3.0 + 0.8 * __import__("math").sin(t * 4),
                    "temperature": 35.5 + 2.0 * __import__("math").sin(t * 0.1),
                    "x_rms_acceleration": 0.5 + 0.1 * __import__("math").sin(t * 10),
                }
            else:
                from backend.database.sensor_data import queue_vibit_reading
                queue_vibit_reading("triac_vibit1", vibit1_data)
                
            if not vibit2_data:
                vibit2_data = {
                    "x_peak_velocity": 1.2 + 0.3 * __import__("math").cos(t * 5),
                    "y_peak_velocity": 1.4 + 0.2 * __import__("math").sin(t * 6),
                    "z_peak_velocity": 1.6 + 0.4 * __import__("math").cos(t * 4),
                    "temperature": 32.1 + 1.5 * __import__("math").cos(t * 0.1),
                    "reboot_count": 0
                }
            else:
                from backend.database.sensor_data import queue_vibit_reading
                queue_vibit_reading("triac_vibit2", vibit2_data)

            # Map to spindle and tool vibration/temperature to match Mirac structure
            rms_vel_1_values = [
                vibit1_data.get("x_rms_velocity", 0) or vibit1_data.get("x_rms_vel", 0),
                vibit1_data.get("y_rms_velocity", 0) or vibit1_data.get("y_rms_vel", 0),
                vibit1_data.get("z_rms_velocity", 0) or vibit1_data.get("z_rms_vel", 0),
            ]
            
            peak_vel_2_values = [
                vibit2_data.get("x_peak_velocity", 0) or vibit2_data.get("x_peak_vel", 0),
                vibit2_data.get("y_peak_velocity", 0) or vibit2_data.get("y_peak_vel", 0),
                vibit2_data.get("z_peak_velocity", 0) or vibit2_data.get("z_peak_vel", 0),
            ]

            return {
                "connected": True,
                "timestamp": time.time(),
                "simulated_plc": is_simulated_plc,
                "simulated_vibit": is_simulated_vibit,
                "axes": {
                    "x": {"value": plc_data.get("x_pos", 0), "unit": "mm"},
                    "y": {"value": plc_data.get("y_pos", 0), "unit": "mm"},
                    "z": {"value": plc_data.get("z_pos", 0), "unit": "mm"},
                    "vibration": max(rms_vel_1_values) if rms_vel_1_values else 0.0
                },
                "spindle": {
                    "speed": plc_data.get("spindle_speed", 0),
                    "temperature": vibit1_data.get("temperature", 0.0),
                    "vibration": max(rms_vel_1_values) if rms_vel_1_values else 0.0
                },
                "tool": {
                    "number": plc_data.get("tool_number", 0),
                    "temperature": vibit2_data.get("temperature", 0.0),
                    "vibration": max(peak_vel_2_values) if peak_vel_2_values else 0.0,
                    "reboot_count": vibit2_data.get("reboot_count", 0)
                },
                "status": {
                    "tool": f"T0{int(plc_data.get('tool_number', 0))}",
                    "error": plc_data.get("error_code", 0),
                    "mode": "AUTO" if plc_data.get("spindle_speed", 0) > 0 else "IDLE"
                },
                "vibit": vibit1_data
            }
            
        except Exception as e:
            logger.error(f"Error reading Triac data: {e}")
            return {
                "connected": False,
                "timestamp": time.time()
            }
            
    async def _broadcast_loop(self):
        """Main broadcast loop - reads and sends data continuously"""
        self.is_broadcasting = True
        logger.info("Triac broadcast loop started")
        
        try:
            while self.is_broadcasting and len(self.active_connections) > 0:
                data = await self._read_triac_data()
                
                if data:
                    message = json.dumps(data)
                    disconnected = set()
                    
                    for connection in self.active_connections:
                        try:
                            await connection.send_text(message)
                        except Exception as e:
                            logger.error(f"Error sending to client: {e}")
                            disconnected.add(connection)
                    
                    for conn in disconnected:
                        self.disconnect(conn)
                
                await asyncio.sleep(0.1) # 10Hz update rate
                
        except asyncio.CancelledError:
            logger.info("Triac broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Triac broadcast loop error: {e}")
        finally:
            self.is_broadcasting = False
            logger.info("Triac broadcast loop stopped")

# Global broadcaster instance
triac_broadcaster = TriacBroadcaster()
