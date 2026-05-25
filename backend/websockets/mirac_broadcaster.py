import asyncio
import copy
import json
import time
from fastapi import WebSocket
from typing import Set
from backend.stations.mirac.cnc_mirac_station import opcua_connection, MIRAC_DATA_TAGS
from backend.communication.vibit_modbus import VibitModbusReader
from backend.config import settings
import logging

logger = logging.getLogger(__name__)


class MiracBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
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
        )
        self._last_modbus_read_time = 0.0
        self._cached_modbus_data = (None, None, None)
        
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
        """Read current MIRAC PLC data from OPC UA server.
        
        Returns real sensor values only. Returns empty dict if PLC is offline.
        """
        if not opcua_connection.connected:
            return {}

        data = {}

        def _read_all_tags():
            """Synchronous OPC-UA reads — run in thread pool."""
            result = {}
            for tag_name, node_id in MIRAC_DATA_TAGS.items():
                try:
                    node = opcua_connection.client.get_node(node_id)
                    value = node.get_value()
                    result[tag_name] = value
                except Exception as e:
                    logger.warning(f"Failed to read {tag_name}: {e}")
                    result[tag_name] = None
            return result

        try:
            data = await asyncio.to_thread(_read_all_tags)
        except Exception as e:
            logger.error(f"Error reading PLC data in thread: {e}")
            return {}

        return data

    async def _read_mirac_data(self) -> dict:
        """Build unified payload for frontend using ONLY real sensor data.
        
        No simulation or fake values. When a sensor is offline,
        its values are null/zero and data_sources flags indicate the state.
        """
        try:
            # Read PLC data (real OPC-UA values only)
            plc_data = await self._read_plc_data()
            plc_connected = bool(plc_data)

            # Throttle physical Modbus reads to a rate of 0.5 Hz (every 2.0s) to relax the RS485 serial network
            now = time.time()
            if now - self._last_modbus_read_time >= 2.0:
                self._last_modbus_read_time = now
                vibit1_data, vibit2_data, vibit3_data = await asyncio.gather(
                    asyncio.to_thread(self.vibit_reader_1.read_snapshot),
                    asyncio.to_thread(self.vibit_reader_2.read_snapshot),
                    asyncio.to_thread(self.vibit_reader_3.read_energy_snapshot, False)
                )
                self._cached_modbus_data = (vibit1_data, vibit2_data, vibit3_data)
            else:
                vibit1_data, vibit2_data, vibit3_data = copy.deepcopy(self._cached_modbus_data)

            # Track which sensors are actually connected
            vibit1_connected = vibit1_data is not None
            vibit2_connected = vibit2_data is not None
            vibit3_connected = vibit3_data is not None

            # If a sensor is offline, use empty dict (NO simulation)
            if not vibit1_data:
                vibit1_data = {}
            if not vibit2_data:
                vibit2_data = {}
            if not vibit3_data:
                vibit3_data = {}

            # Fill missing keys with None to ensure frontend doesn't break
            def fill_defaults(data_dict: dict, connected: bool) -> dict:
                all_keys = [
                    "x_rms_acc", "y_rms_acc", "z_rms_acc",
                    "x_rms_vel", "y_rms_vel", "z_rms_vel",
                    "temperature",
                    "x_peak_acc", "y_peak_acc", "z_peak_acc",
                    "x_peak_vel", "y_peak_vel", "z_peak_vel",
                    "reboot_count", "led_status", "rpm"
                ]
                for key in all_keys:
                    if key not in data_dict or data_dict[key] is None:
                        # Use None when disconnected so frontend shows "---"
                        # Use 0.0 when connected but key is missing (partial read)
                        data_dict[key] = 0.0 if connected else None
                return data_dict

            vibit1_data = fill_defaults(vibit1_data, vibit1_connected)
            vibit2_data = fill_defaults(vibit2_data, vibit2_connected)

            # 1. Spindle metrics (from VibIT 1 — real sensor data only)
            vibit1_temp = vibit1_data.get("temperature")
            vibit1_rpm = vibit1_data.get("rpm")
            vibit1_rms_vel = [
                vibit1_data.get("x_rms_vel"),
                vibit1_data.get("y_rms_vel"),
                vibit1_data.get("z_rms_vel"),
            ]
            rms_vel_1_values = [v for v in vibit1_rms_vel if v is not None]

            # 2. Tool metrics (from VibIT 2 — real sensor data only)
            vibit2_temp = vibit2_data.get("temperature")
            vibit2_peak_vel = [
                vibit2_data.get("x_peak_vel"),
                vibit2_data.get("y_peak_vel"),
                vibit2_data.get("z_peak_vel"),
            ]
            peak_vel_2_values = [v for v in vibit2_peak_vel if v is not None]

            # PLC LED states (real values or False if offline)
            green_on = bool(plc_data.get("led_green", False))
            red_on = bool(plc_data.get("led_red", False))
            yellow_on = bool(plc_data.get("led_yellow", False))

            # Spindle speed: prefer VibIT RPM, fall back to PLC value
            spindle_speed = vibit1_rpm if vibit1_rpm is not None else plc_data.get("spindle_speed", None)

            # Organize data into a clean JSON structure for the frontend
            return {
                "timestamp": asyncio.get_event_loop().time(),
                "data_sources": {
                    "plc": plc_connected,
                    "vibit1": vibit1_connected,
                    "vibit2": vibit2_connected,
                    "vibit3": vibit3_connected,
                },
                "status": {
                    "red": red_on,
                    "yellow": yellow_on,
                    "green": green_on,
                    "cycle_start": plc_data.get("cycle_start", False) if plc_connected else None,
                    "cycle_stop": plc_data.get("cycle_stop", False) if plc_connected else None,
                    "pneumatic_chuck": plc_data.get("pneumatic_chuck", False) if plc_connected else None,
                },
                "spindle": {
                    "speed": spindle_speed,
                    "temperature": vibit1_temp if vibit1_temp is not None else plc_data.get("spindle_temp", None),
                    "vibration": max(rms_vel_1_values) if rms_vel_1_values else (plc_data.get("spindle_vibration", None) if plc_connected else None),
                },
                "tool": {
                    "number": plc_data.get("tool_number", None) if plc_connected else None,
                    "temperature": vibit2_temp if vibit2_temp is not None else plc_data.get("tool_temp", None),
                    "vibration": max(peak_vel_2_values) if peak_vel_2_values else (plc_data.get("tool_vibration", None) if plc_connected else None),
                    "reboot_count": vibit2_data.get("reboot_count", None),
                },
                "axes": {
                    "x": {
                        "value": plc_data.get("x_axis_value", None) if plc_connected else None,
                        "feed": plc_data.get("x_axis_feed", None) if plc_connected else None,
                    },
                    "z": {
                        "value": plc_data.get("z_axis_value", None) if plc_connected else None,
                        "feed": plc_data.get("z_axis_feed", None) if plc_connected else None,
                    },
                    "vibration": None,
                },
                "energy_meter": {
                    "power": vibit3_data.get("power"),
                    "kwh": vibit3_data.get("kwh"),
                    "raw_power_regs": vibit3_data.get("raw_power_regs"),
                    "raw_kwh_regs": vibit3_data.get("raw_kwh_regs"),
                } if vibit3_connected else None,
                "raw": {
                    "vibit1": vibit1_data,
                    "vibit2": vibit2_data,
                    "vibit3": vibit3_data,
                    "plc": plc_data,
                },
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
                
                # Wait before next update (10 Hz update rate for smooth coordinate changes)
                await asyncio.sleep(0.1)
        
        except asyncio.CancelledError:
            logger.info("Mirac broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Mirac broadcast loop error: {e}")
        finally:
            self.vibit_reader_1.close()
            self.vibit_reader_2.close()
            self.vibit_reader_3.close()
            self.is_broadcasting = False
            logger.info("Mirac broadcast loop stopped")

# Global broadcaster instance
mirac_broadcaster = MiracBroadcaster()
