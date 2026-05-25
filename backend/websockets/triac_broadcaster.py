import asyncio
import copy
import json
import logging
import time
from typing import Dict, Any, Set
from fastapi import WebSocket
from backend.communication.vibit_modbus import VibitModbusReader
from backend.config import settings
from backend.stations.triac.cnc_triac_station import opcua_connection as triac_opcua_connection

logger = logging.getLogger(__name__)


class TriacBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        self.vibit_reader_1 = VibitModbusReader(
            host=settings.TRIAC_VIBIT_HOST,
            port=settings.TRIAC_VIBIT_PORT,
            device_id=settings.TRIAC_VIBIT_UNIT_ID,
        )
        self.vibit_reader_2 = VibitModbusReader(
            host=settings.TRIAC_VIBIT_HOST,
            port=settings.TRIAC_VIBIT_PORT,
            device_id=settings.TRIAC_VIBIT_UNIT_ID_2,
        )
        self.vibit_reader_3 = VibitModbusReader(
            host=settings.TRIAC_VIBIT_HOST,
            port=settings.TRIAC_VIBIT_PORT,
            device_id=settings.TRIAC_VIBIT_UNIT_ID_3,
        )
        self._last_modbus_read_time = 0.0
        self._cached_modbus_data = (None, None, None)

        # Physics-based coordinates and G-Code block state for milling visualization
        self.x_pos = 0.0
        self.y_pos = 0.0
        self.z_pos = 50.0
        self.gcode_index = 0
        self.sim_fraction = 0.0
        self.coolant_on = False

        self.gcode_program = [
            {"block": "M03 S1500 M08 (Spindle ON, Coolant ON)", "rpm": 1500, "feed": 0, "coolant": True, "z": 50, "x": 0, "y": 0, "blockNum": "N10"},
            {"block": "G00 X30.0 Y30.0 Z30.0 (Rapid Approach)", "rpm": 1500, "feed": 800, "coolant": True, "z": 30, "x": 30, "y": 30, "blockNum": "N20"},
            {"block": "G01 Z5.0 F150 (Feed to safety plane)", "rpm": 1500, "feed": 150, "coolant": True, "z": 5, "x": 30, "y": 30, "blockNum": "N30"},
            {"block": "G01 Z-2.0 F100 (Plunge cut)", "rpm": 1500, "feed": 100, "coolant": True, "z": 0, "x": 30, "y": 30, "blockNum": "N40"},
            {"block": "G01 X70.0 Y30.0 F180 (Linear cut side 1)", "rpm": 1495, "feed": 180, "coolant": True, "z": 0, "x": 70, "y": 30, "blockNum": "N50"},
            {"block": "G02 X70.0 Y70.0 R20.0 (Circular arc pocket)", "rpm": 1488, "feed": 160, "coolant": True, "z": 0, "x": 70, "y": 70, "blockNum": "N60"},
            {"block": "G01 X30.0 Y70.0 F180 (Linear cut side 2)", "rpm": 1496, "feed": 180, "coolant": True, "z": 0, "x": 30, "y": 70, "blockNum": "N70"},
            {"block": "G01 Y30.0 F180 (Close profile cut)", "rpm": 1498, "feed": 180, "coolant": True, "z": 0, "x": 30, "y": 30, "blockNum": "N80"},
            {"block": "G00 Z40.0 M09 (Retract tool, Coolant OFF)", "rpm": 1500, "feed": 800, "coolant": False, "z": 40, "x": 30, "y": 30, "blockNum": "N90"},
            {"block": "G00 X0 Y0 Z50.0 M05 (Return home, Spindle STOP)", "rpm": 0, "feed": 800, "coolant": False, "z": 50, "x": 0, "y": 0, "blockNum": "N100"},
            {"block": "M30 (Program end / Reset cycle)", "rpm": 0, "feed": 0, "coolant": False, "z": 50, "x": 0, "y": 0, "blockNum": "N110"},
        ]

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

    def _update_coordinate_simulation(self, is_spindle_running: bool):
        """Linearly interpolate coordinate changes to drive milling visualizer smoothly"""
        if not is_spindle_running:
            self.x_pos = 0.0
            self.y_pos = 0.0
            self.z_pos = 50.0
            self.coolant_on = False
            self.gcode_index = 0
            self.sim_fraction = 0.0
            return

        total_steps = len(self.gcode_program)
        curr_idx = self.gcode_index % total_steps
        next_idx = (self.gcode_index + 1) % total_steps

        curr_block = self.gcode_program[curr_idx]
        next_block = self.gcode_program[next_idx]

        self.coolant_on = curr_block["coolant"]

        # Linearly interpolate
        f = self.sim_fraction
        self.x_pos = curr_block["x"] + (next_block["x"] - curr_block["x"]) * f
        self.y_pos = curr_block["y"] + (next_block["y"] - curr_block["y"]) * f
        self.z_pos = curr_block["z"] + (next_block["z"] - curr_block["z"]) * f

        # Increment simulation fraction
        self.sim_fraction += 0.2
        if self.sim_fraction >= 1.0:
            self.sim_fraction = 0.0
            self.gcode_index = (self.gcode_index + 1) % total_steps

    async def _read_triac_data(self) -> Dict[str, Any] | None:
        """Build unified payload for frontend using real sensors from TRIAC.
        For the OPC UA connection, check gateway state.
        For coordinates, use physics simulation driven by spindle state.
        """
        try:
            plc_connected = triac_opcua_connection.connected

            # Throttle physical Modbus reads to a rate of 0.5 Hz (every 2.0s) to relax the RS485 serial network
            now = time.time()
            if now - self._last_modbus_read_time >= 2.0:
                self._last_modbus_read_time = now
                vibit1_data, vibit2_data, vibit3_data = await asyncio.gather(
                    asyncio.to_thread(self.vibit_reader_1.read_snapshot),
                    asyncio.to_thread(self.vibit_reader_2.read_snapshot),
                    asyncio.to_thread(self.vibit_reader_3.read_energy_snapshot, True)
                )
                self._cached_modbus_data = (vibit1_data, vibit2_data, vibit3_data)
            else:
                vibit1_data, vibit2_data, vibit3_data = copy.deepcopy(self._cached_modbus_data)

            vibit1_connected = vibit1_data is not None
            vibit2_connected = vibit2_data is not None
            vibit3_connected = vibit3_data is not None

            if not vibit1_data:
                vibit1_data = {}
            if not vibit2_data:
                vibit2_data = {}
            if not vibit3_data:
                vibit3_data = {}

            # Fill defaults for sensor data
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
                        data_dict[key] = 0.0 if connected else None
                return data_dict

            vibit1_data = fill_defaults(vibit1_data, vibit1_connected)
            vibit2_data = fill_defaults(vibit2_data, vibit2_connected)

            # Spindle RPM
            vibit1_rpm = vibit1_data.get("rpm")
            spindle_speed = vibit1_rpm if vibit1_rpm is not None else 0.0
            is_running = spindle_speed > 0

            # Update coordinates
            self._update_coordinate_simulation(is_running)

            curr_block = self.gcode_program[self.gcode_index % len(self.gcode_program)]

            return {
                "timestamp": asyncio.get_event_loop().time(),
                "data_sources": {
                    "plc": plc_connected,
                    "vibit1": vibit1_connected,
                    "vibit2": vibit2_connected,
                    "vibit3": vibit3_connected,
                },
                "status": {
                    "red": not plc_connected,
                    "yellow": plc_connected and is_running,
                    "green": plc_connected and not is_running,
                    "cycle_start": is_running,
                    "cycle_stop": not is_running,
                },
                "spindle": {
                    "speed": spindle_speed if plc_connected else None,
                    "temperature": vibit1_data.get("temperature"),
                    "vibration": max([v for v in [
                        vibit1_data.get("x_rms_vel"),
                        vibit1_data.get("y_rms_vel"),
                        vibit1_data.get("z_rms_vel")
                    ] if v is not None]) if vibit1_connected else None,
                },
                "tool": {
                    "number": 2 if is_running else 0,
                    "temperature": vibit2_data.get("temperature"),
                    "vibration": max([v for v in [
                        vibit2_data.get("x_peak_vel"),
                        vibit2_data.get("y_peak_vel"),
                        vibit2_data.get("z_peak_vel")
                    ] if v is not None]) if vibit2_connected else None,
                    "reboot_count": vibit2_data.get("reboot_count"),
                },
                "axes": {
                    "x": {
                        "value": self.x_pos if plc_connected else None,
                        "feed": curr_block["feed"] if is_running and plc_connected else 0.0,
                    },
                    "y": {
                        "value": self.y_pos if plc_connected else None,
                        "feed": curr_block["feed"] if is_running and plc_connected else 0.0,
                    },
                    "z": {
                        "value": self.z_pos if plc_connected else None,
                        "feed": curr_block["feed"] if is_running and plc_connected else 0.0,
                    },
                    "vibration": None,
                },
                "gcode": {
                    "block": curr_block["block"] if plc_connected else "SYSTEM OFFLINE",
                    "block_num": curr_block["blockNum"] if plc_connected else "",
                    "index": self.gcode_index if plc_connected else -1,
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
                },
            }
        except Exception as e:
            logger.error(f"Error reading triac data: {e}")
            return None

    async def _broadcast_loop(self):
        """Main broadcast loop for TRIAC - streams data at 10 Hz"""
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

                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            logger.info("Triac broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Triac broadcast loop error: {e}")
        finally:
            self.vibit_reader_1.close()
            self.vibit_reader_2.close()
            self.vibit_reader_3.close()
            self.is_broadcasting = False
            logger.info("Triac broadcast loop stopped")


# Global broadcaster instance
triac_broadcaster = TriacBroadcaster()
