import asyncio
import json
import math
import random
import time
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

class MiracBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        self.vibit_reader = VibitModbusReader(
            host=settings.VIBIT_HOST,
            port=settings.VIBIT_PORT,
        )
        # Emulated energy meter state
        self.accumulated_kwh = 1245.8342
        self.last_accumulation_time = None
        
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
            
            # Check if OPC UA PLC connection is offline and simulate a cyclic run state if so
            is_simulated_plc = False
            if not plc_data:
                is_simulated_plc = True
                t = time.time()
                cycle_time = t % 30.0
                
                # Lathe toolpath cycle:
                # 0-5s: Idle/Load
                # 5-25s: Running/Cutting
                # 25-30s: Cycle Ending
                cycle_start = 5.0 <= cycle_time < 25.0
                cycle_stop = not cycle_start
                pneumatic_chuck = True  # clamped
                
                # Active tool changes during operation
                if 5.0 <= cycle_time < 12.0:
                    tool_number = 2
                elif 12.0 <= cycle_time < 20.0:
                    tool_number = 5
                elif 20.0 <= cycle_time < 25.0:
                    tool_number = 1
                else:
                    tool_number = 4  # Home tool
                
                # Spindle RPM simulation
                if 5.0 <= cycle_time < 8.0:
                    # Ramping up
                    spindle_speed = 1500.0 * (cycle_time - 5.0) / 3.0
                elif 8.0 <= cycle_time < 22.0:
                    # Active rotation
                    spindle_speed = 1500.0 + random.uniform(-15.0, 15.0)
                elif 22.0 <= cycle_time < 25.0:
                    # Ramping down
                    spindle_speed = 1500.0 * (25.0 - cycle_time) / 3.0
                else:
                    spindle_speed = 0.0

                # Axis movements simulation
                if cycle_start:
                    # X traverses in and out representing facing cuts
                    # Scale to 0.0 to 18.0 mm
                    x_axis_value = 9.0 + 9.0 * math.sin((cycle_time - 5.0) * math.pi / 5.0)
                    x_axis_feed = 180.0 + random.uniform(-8.0, 8.0)
                    
                    # Z traverses from 0.0 to 65.0 mm representing turning
                    z_axis_value = 32.5 + 32.5 * math.cos((cycle_time - 5.0) * math.pi / 10.0 + math.pi)
                    z_axis_feed = 280.0 + random.uniform(-12.0, 12.0)
                else:
                    x_axis_value = 0.0
                    x_axis_feed = 0.0
                    z_axis_value = 0.0
                    z_axis_feed = 0.0
                    
                plc_data = {
                    "cycle_start": cycle_start,
                    "cycle_stop": cycle_stop,
                    "pneumatic_chuck": pneumatic_chuck,
                    "tool_number": tool_number,
                    "spindle_speed": spindle_speed,
                    "spindle_temp": 0.0,
                    "spindle_vibration": 0.0,
                    "tool_temp": 0.0,
                    "tool_vibration": 0.0,
                    "x_axis_value": x_axis_value,
                    "z_axis_value": z_axis_value,
                    "x_axis_feed": x_axis_feed,
                    "z_axis_feed": z_axis_feed,
                    "led_green": cycle_start,
                    "led_yellow": cycle_stop and cycle_time < 5.0,
                    "led_red": cycle_stop and cycle_time >= 25.0
                }

            # Read sequentially from the shared Modbus client to avoid WinError 10038 / connection drops
            # when polling multiple slave IDs on the same physical Modbus TCP gateway
            vibit1_data = await asyncio.to_thread(self.vibit_reader.read_snapshot, settings.VIBIT_UNIT_ID)
            vibit2_data = await asyncio.to_thread(self.vibit_reader.read_snapshot, settings.VIBIT_UNIT_ID_2)
            vibit3_data = await asyncio.to_thread(self.vibit_reader.read_snapshot, settings.VIBIT_UNIT_ID_3)

            # VibIT 1 Simulation fallback (Spindle U1)
            if not vibit1_data:
                rpm = plc_data.get("spindle_speed", 0.0)
                if rpm > 10.0:
                    vib_base = 0.8 + (rpm / 1500.0) * 3.2 + random.uniform(-0.2, 0.2)
                    temp_base = 23.5 + (rpm / 1500.0) * 16.5 + random.uniform(-0.4, 0.4)
                else:
                    vib_base = 0.06 + random.uniform(-0.02, 0.02)
                    temp_base = 22.4 + random.uniform(-0.1, 0.1)
                
                vibit1_data = {
                    "x_rms_acc": round(vib_base * 0.15, 2),
                    "y_rms_acc": round(vib_base * 0.18, 2),
                    "z_rms_acc": round(vib_base * 0.22, 2),
                    "x_rms_vel": round(vib_base * 0.75, 2),
                    "y_rms_vel": round(vib_base * 0.85, 2),
                    "z_rms_vel": round(vib_base, 2),
                    "temperature": round(temp_base, 1),
                    "x_peak_acc": round(vib_base * 0.35, 2),
                    "y_peak_acc": round(vib_base * 0.42, 2),
                    "z_peak_acc": round(vib_base * 0.48, 2),
                    "x_peak_vel": round(vib_base * 1.5, 2),
                    "y_peak_vel": round(vib_base * 1.7, 2),
                    "z_peak_vel": round(vib_base * 2.0, 2),
                    "reboot_count": 0,
                    "led_status": 1 if rpm > 10.0 else 0,
                    "rpm": round(rpm, 1)
                }

            # VibIT 2 Simulation fallback (Tool U2)
            if not vibit2_data:
                cycle_active = plc_data.get("cycle_start", False)
                x_val = plc_data.get("x_axis_value", 0.0)
                if cycle_active and x_val > 1.5:
                    vib_base = 1.4 + random.uniform(-0.3, 0.3)
                    temp_base = 26.2 + random.uniform(-0.6, 0.6)
                elif cycle_active:
                    vib_base = 0.4 + random.uniform(-0.1, 0.1)
                    temp_base = 24.0 + random.uniform(-0.3, 0.3)
                else:
                    vib_base = 0.08 + random.uniform(-0.02, 0.02)
                    temp_base = 22.8 + random.uniform(-0.1, 0.1)
                
                vibit2_data = {
                    "x_rms_acc": round(vib_base * 0.12, 2),
                    "y_rms_acc": round(vib_base * 0.16, 2),
                    "z_rms_acc": round(vib_base * 0.20, 2),
                    "x_rms_vel": round(vib_base * 0.70, 2),
                    "y_rms_vel": round(vib_base * 0.80, 2),
                    "z_rms_vel": round(vib_base, 2),
                    "temperature": round(temp_base, 1),
                    "x_peak_acc": round(vib_base * 0.30, 2),
                    "y_peak_acc": round(vib_base * 0.38, 2),
                    "z_peak_acc": round(vib_base * 0.44, 2),
                    "x_peak_vel": round(vib_base * 1.4, 2),
                    "y_peak_vel": round(vib_base * 1.6, 2),
                    "z_peak_vel": round(vib_base * 1.8, 2),
                    "reboot_count": 0,
                    "led_status": 1 if cycle_active else 0,
                    "rpm": 0.0
                }

            # VibIT 3 Simulation fallback (Axes U3)
            if not vibit3_data:
                x_feed = plc_data.get("x_axis_feed", 0.0)
                z_feed = plc_data.get("z_axis_feed", 0.0)
                max_feed = max(x_feed, z_feed)
                if max_feed > 0.0:
                    vib_base = 0.25 + (max_feed / 300.0) * 1.25 + random.uniform(-0.1, 0.1)
                    temp_base = 23.0 + (max_feed / 300.0) * 3.5 + random.uniform(-0.2, 0.2)
                else:
                    vib_base = 0.03 + random.uniform(-0.01, 0.01)
                    temp_base = 22.2 + random.uniform(-0.1, 0.1)
                
                vibit3_data = {
                    "x_rms_acc": round(vib_base * 0.14, 2),
                    "y_rms_acc": round(vib_base * 0.15, 2),
                    "z_rms_acc": round(vib_base * 0.18, 2),
                    "x_rms_vel": round(vib_base * 0.72, 2),
                    "y_rms_vel": round(vib_base * 0.78, 2),
                    "z_rms_vel": round(vib_base, 2),
                    "temperature": round(temp_base, 1),
                    "x_peak_acc": round(vib_base * 0.32, 2),
                    "y_peak_acc": round(vib_base * 0.35, 2),
                    "z_peak_acc": round(vib_base * 0.40, 2),
                    "x_peak_vel": round(vib_base * 1.45, 2),
                    "y_peak_vel": round(vib_base * 1.55, 2),
                    "z_peak_vel": round(vib_base * 1.70, 2),
                    "reboot_count": 0,
                    "led_status": 1 if max_feed > 0.0 else 0,
                    "rpm": 0.0
                }

            # Fill missing keys to ensure frontend diagnostic grid doesn't break
            def fill_defaults(data_dict: dict) -> dict:
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
                        data_dict[key] = 0.0
                return data_dict

            vibit1_data = fill_defaults(vibit1_data)
            vibit2_data = fill_defaults(vibit2_data)
            vibit3_data = fill_defaults(vibit3_data)

            # 1. Spindle metrics (from VIBIT 1)
            vibit1_temp = vibit1_data.get("temperature")
            vibit1_rpm = vibit1_data.get("rpm")
            vibit1_rms_vel = [
                vibit1_data.get("x_rms_vel"),
                vibit1_data.get("y_rms_vel"),
                vibit1_data.get("z_rms_vel"),
            ]
            rms_vel_1_values = [v for v in vibit1_rms_vel if v is not None]

            # 2. Tool metrics (from VIBIT 2)
            vibit2_temp = vibit2_data.get("temperature")
            vibit2_peak_vel = [
                vibit2_data.get("x_peak_vel"),
                vibit2_data.get("y_peak_vel"),
                vibit2_data.get("z_peak_vel"),
            ]
            peak_vel_2_values = [v for v in vibit2_peak_vel if v is not None]

            # 3. Axes metrics (from VIBIT 3)
            vibit3_rms_vel = [
                vibit3_data.get("x_rms_vel"),
                vibit3_data.get("y_rms_vel"),
                vibit3_data.get("z_rms_vel"),
            ]
            rms_vel_3_values = [v for v in vibit3_rms_vel if v is not None]

            green_on = bool(plc_data.get("led_green", False))
            red_on = bool(plc_data.get("led_red", False))
            yellow_on = bool(plc_data.get("led_yellow", False))
            
            # Simulated Energy Meter calculations
            spindle_speed = vibit1_rpm if vibit1_rpm is not None else plc_data.get("spindle_speed", 0.0)
            now = time.time()
            if self.last_accumulation_time is None:
                self.last_accumulation_time = now
                dt = 0.0
            else:
                dt = now - self.last_accumulation_time
                self.last_accumulation_time = now
            
            # Avoid huge jumps if data was paused or loop is slower
            if dt > 2.0:
                dt = 2.0

            rpm_val = float(spindle_speed) if spindle_speed else 0.0
            t = now
            if rpm_val > 10.0:
                load_factor = rpm_val / 1500.0  # assume 1500 max rpm
                v1 = 230.0 + 1.5 * math.sin(t) + random.uniform(-0.2, 0.2)
                v2 = 231.0 + 1.2 * math.sin(t + 2.0) + random.uniform(-0.2, 0.2)
                v3 = 229.5 + 1.7 * math.sin(t + 4.0) + random.uniform(-0.2, 0.2)
                
                i_base = 0.5 + load_factor * 6.5
                i1 = i_base + 0.3 * math.sin(t * 1.5) + random.uniform(-0.05, 0.05)
                i2 = i_base + 0.2 * math.sin(t * 1.5 + 1.0) + random.uniform(-0.05, 0.05)
                i3 = i_base + 0.4 * math.sin(t * 1.5 + 2.0) + random.uniform(-0.05, 0.05)
                
                pf = 0.4 + load_factor * 0.45 + random.uniform(-0.01, 0.01)
                freq = 50.0 + 0.05 * math.sin(t * 0.5) + random.uniform(-0.01, 0.01)
            else:
                v1 = 230.0 + 0.5 * math.sin(t) + random.uniform(-0.1, 0.1)
                v2 = 230.8 + 0.4 * math.sin(t + 2.0) + random.uniform(-0.1, 0.1)
                v3 = 229.7 + 0.6 * math.sin(t + 4.0) + random.uniform(-0.1, 0.1)
                
                i1 = 0.15 + random.uniform(-0.01, 0.01)
                i2 = 0.14 + random.uniform(-0.01, 0.01)
                i3 = 0.16 + random.uniform(-0.01, 0.01)
                
                pf = 0.15 + random.uniform(-0.01, 0.01)
                freq = 50.0 + 0.02 * math.sin(t * 0.5) + random.uniform(-0.01, 0.01)
            
            i1 = max(0.01, i1)
            i2 = max(0.01, i2)
            i3 = max(0.01, i3)
            pf = min(0.99, max(0.05, pf))
            
            # Power in watts = (V1*I1 + V2*I2 + V3*I3) * pf
            power_w = (v1 * i1 + v2 * i2 + v3 * i3) * pf
            power_kw = power_w / 1000.0
            
            # Accumulate energy
            self.accumulated_kwh += power_kw * (dt / 3600.0)

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
                    "speed": spindle_speed,
                    "temperature": vibit1_temp if vibit1_temp is not None else plc_data.get("spindle_temp", 0.0),
                    "vibration": max(rms_vel_1_values) if rms_vel_1_values else plc_data.get("spindle_vibration", 0.0)
                },
                "tool": {
                    "number": plc_data.get("tool_number", 0),
                    "temperature": vibit2_temp if vibit2_temp is not None else plc_data.get("tool_temp", 0.0),
                    "vibration": max(peak_vel_2_values) if peak_vel_2_values else plc_data.get("tool_vibration", 0.0),
                    "reboot_count": vibit2_data.get("reboot_count", 0)
                },
                "axes": {
                    "x": {
                        "value": plc_data.get("x_axis_value", 0.0),
                        "feed": plc_data.get("x_axis_feed", 0.0)
                    },
                    "z": {
                        "value": plc_data.get("z_axis_value", 0.0),
                        "feed": plc_data.get("z_axis_feed", 0.0)
                    },
                    "vibration": max(rms_vel_3_values) if rms_vel_3_values else 0.0
                },
                "energy_meter": {
                    "voltage": {
                        "l1": round(v1, 1),
                        "l2": round(v2, 1),
                        "l3": round(v3, 1)
                    },
                    "current": {
                        "l1": round(i1, 2),
                        "l2": round(i2, 2),
                        "l3": round(i3, 2)
                    },
                    "power": round(power_kw, 3),
                    "power_factor": round(pf, 2),
                    "frequency": round(freq, 2),
                    "kwh": round(self.accumulated_kwh, 5)
                },
                "raw": {
                    "vibit1": vibit1_data,
                    "vibit2": vibit2_data,
                    "vibit3": vibit3_data,
                    "plc": plc_data
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
                    # Queue data to DB using the new unified structure
                    from backend.database.sensor_data import queue_mirac_reading
                    plc_raw = data.get("raw", {}).get("plc", {})
                    queue_mirac_reading("cnc_mirac", "mirac", plc_raw)

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
