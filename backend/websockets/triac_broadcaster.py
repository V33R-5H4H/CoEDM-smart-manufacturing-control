import asyncio
import copy
import logging
import time
from typing import Dict, Any, Set
from fastapi import WebSocket
from backend.communication.vibit_modbus import VibitModbusReader
from backend.config import settings
from backend.stations.triac.cnc_triac_station import opcua_connection as triac_opcua_connection
from backend.core.delta import (
    compute_delta,
    build_snapshot_message,
    build_delta_message,
    build_heartbeat_message,
)

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
            base_address=4000,
            register_type="input"
        )
        self.vibit_reader_2 = VibitModbusReader(
            host=settings.TRIAC_VIBIT_HOST,
            port=settings.TRIAC_VIBIT_PORT,
            device_id=settings.TRIAC_VIBIT_UNIT_ID_2,
            base_address=4000,
            register_type="input"
        )
        self.vibit_reader_3 = VibitModbusReader(
            host=settings.TRIAC_VIBIT_HOST,
            port=settings.TRIAC_VIBIT_PORT,
            device_id=settings.TRIAC_VIBIT_UNIT_ID_3,
            base_address=4000,
            register_type="input"
        )
        self._last_modbus_read_time = 0.0
        self._cached_modbus_data = (None, None, None)
        self._modbus_data_fresh = False  # True when new Modbus data was just read
        self._modbus_task = None  # Background task for Modbus reads
        self._sensor_ids_cached = None
        self._last_good_vibit1 = None
        self._last_good_vibit2 = None
        self._last_good_vibit3 = None
        self._db_init_done = False  # Ensures DB init runs exactly once
        # Delta-send state
        self._last_broadcast_payload: dict = {}
        self._heartbeat_tick: int = 0

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

    def _get_sensor_ids(self) -> dict:
        """Resolve sensor UUIDs dynamically."""
        if self._sensor_ids_cached:
            return self._sensor_ids_cached
            
        from backend.database.db import SessionLocal
        from sqlalchemy import text
        session = SessionLocal()
        try:
            rows = session.execute(
                text("SELECT sensor_id, legacy_key FROM machine_sensors WHERE machine_id = 'triac'")
            ).fetchall()
            self._sensor_ids_cached = {row[1]: str(row[0]) for row in rows}
            return self._sensor_ids_cached
        except Exception as e:
            logger.error(f"Error resolving triac sensors: {e}")
            return {}
        finally:
            session.close()

    def _init_last_good_from_db(self):
        """Load initial last good values from the database at startup."""
        sensors = self._get_sensor_ids()
        if not sensors:
            return

        from backend.database.db import SessionLocal
        from sqlalchemy import text
        session = SessionLocal()
        try:
            # 1. Load Spindle VibIT 1
            vibit1_id = sensors.get("triac_vibit1")
            if vibit1_id and self._last_good_vibit1 is None:
                res = session.execute(
                    text("""
                        SELECT x_rms_acc, y_rms_acc, z_rms_acc,
                               x_rms_vel, y_rms_vel, z_rms_vel,
                               x_peak_acc, y_peak_acc, z_peak_acc,
                               x_peak_vel, y_peak_vel, z_peak_vel,
                               temperature, rpm, led_status
                        FROM vibit_readings
                        WHERE sensor_id = :sensor_id
                        ORDER BY time DESC LIMIT 1
                    """),
                    {"sensor_id": vibit1_id}
                ).fetchone()
                if res:
                    self._last_good_vibit1 = {
                        "x_rms_acc": res[0], "y_rms_acc": res[1], "z_rms_acc": res[2],
                        "x_rms_vel": res[3], "y_rms_vel": res[4], "z_rms_vel": res[5],
                        "x_peak_acc": res[6], "y_peak_acc": res[7], "z_peak_acc": res[8],
                        "x_peak_vel": res[9], "y_peak_vel": res[10], "z_peak_vel": res[11],
                        "temperature": res[12], "rpm": res[13], "led_status": res[14]
                    }
                    logger.info("[TriacBroadcaster] Loaded initial Spindle VibIT 1 data from DB")

            # 2. Load Tool VibIT 2
            vibit2_id = sensors.get("triac_vibit2")
            if vibit2_id and self._last_good_vibit2 is None:
                res = session.execute(
                    text("""
                        SELECT x_rms_acc, y_rms_acc, z_rms_acc,
                               x_rms_vel, y_rms_vel, z_rms_vel,
                               x_peak_acc, y_peak_acc, z_peak_acc,
                               x_peak_vel, y_peak_vel, z_peak_vel,
                               temperature, rpm, led_status
                        FROM vibit_readings
                        WHERE sensor_id = :sensor_id
                        ORDER BY time DESC LIMIT 1
                    """),
                    {"sensor_id": vibit2_id}
                ).fetchone()
                if res:
                    self._last_good_vibit2 = {
                        "x_rms_acc": res[0], "y_rms_acc": res[1], "z_rms_acc": res[2],
                        "x_rms_vel": res[3], "y_rms_vel": res[4], "z_rms_vel": res[5],
                        "x_peak_acc": res[6], "y_peak_acc": res[7], "z_peak_acc": res[8],
                        "x_peak_vel": res[9], "y_peak_vel": res[10], "z_peak_vel": res[11],
                        "temperature": res[12], "rpm": res[13], "led_status": res[14]
                    }
                    logger.info("[TriacBroadcaster] Loaded initial Tool VibIT 2 data from DB")

            # 3. Load Energy Meter VibIT 3
            energy_id = sensors.get("triac_energy")
            if energy_id and self._last_good_vibit3 is None:
                res = session.execute(
                    text("""
                        SELECT total_net_kwh, average_current
                        FROM energy_meter_data
                        WHERE sensor_id = :sensor_id
                        ORDER BY time DESC LIMIT 1
                    """),
                    {"sensor_id": energy_id}
                ).fetchone()
                if res:
                    self._last_good_vibit3 = {
                        "kwh": res[0],
                        "power": res[1] * 230.0 if res[1] is not None else 0.0
                    }
                    logger.info("[TriacBroadcaster] Loaded initial Energy Meter data from DB")
        except Exception as e:
            logger.error(f"Error loading initial Modbus data from DB: {e}")
        finally:
            session.close()

    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        # Yield to event loop to ensure ASGI server completes the 101 Upgrade response
        await asyncio.sleep(0.1)
        self.active_connections.add(websocket)
        logger.info(f"Triac WebSocket connected. Total connections: {len(self.active_connections)}")

        # Immediately send the last known full state so the new client isn't blank
        if self._last_broadcast_payload:
            try:
                await websocket.send_text(build_snapshot_message(self._last_broadcast_payload))
            except Exception as e:
                logger.warning(f"Could not send initial snapshot to new Triac client: {e}")

        # Start broadcasting if this is the first connection
        if not self.is_broadcasting:
            self.is_broadcasting = True  # Set before creating tasks so poll loop doesn't exit immediately
            self.broadcast_task = asyncio.create_task(self._broadcast_loop())
            self._modbus_task = asyncio.create_task(self._modbus_poll_loop())

    def disconnect(self, websocket: WebSocket):
        """Unregister a WebSocket connection"""
        self.active_connections.discard(websocket)
        logger.info(f"Triac WebSocket disconnected. Total connections: {len(self.active_connections)}")

        # Stop broadcasting if no connections remain
        if len(self.active_connections) == 0 and self.is_broadcasting:
            self.is_broadcasting = False
            if self.broadcast_task:
                self.broadcast_task.cancel()
            if self._modbus_task:
                self._modbus_task.cancel()

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

    async def _modbus_poll_loop(self):
        """
        Background task: polls Modbus sensors every 8s independently of the
        10 Hz broadcast loop. Prevents Modbus timeouts from blocking axis updates.
        """
        logger.info("[TRIAC] Modbus poll loop started")
        while self.is_broadcasting and len(self.active_connections) > 0:
            try:
                try:
                    vibit1_data = await asyncio.to_thread(self.vibit_reader_1.read_snapshot)
                except Exception:
                    vibit1_data = None

                try:
                    vibit2_data = await asyncio.to_thread(self.vibit_reader_2.read_snapshot)
                except Exception:
                    vibit2_data = None

                try:
                    vibit3_data = await asyncio.to_thread(self.vibit_reader_3.read_energy_snapshot, True)
                except Exception:
                    vibit3_data = None

                self._cached_modbus_data = (vibit1_data, vibit2_data, vibit3_data)
                self._modbus_data_fresh = True

                # Log to DB
                sensors = self._get_sensor_ids()
                if sensors:
                    from backend.database.db import SessionLocal
                    from sqlalchemy import text
                    from backend.core.timezone import ist_now
                    plc_connected = triac_opcua_connection.connected
                    now_dt = ist_now()
                    session = SessionLocal()
                    try:
                        plc_sensor_id = sensors.get("triac")
                        if plc_sensor_id:
                            v1_rpm = vibit1_data.get("rpm") if vibit1_data else None
                            spindle_speed = float(v1_rpm) if v1_rpm is not None else 0.0
                            is_running = spindle_speed > 0
                            spindle_temp = float(vibit1_data.get("temperature") or 0.0) if vibit1_data else 0.0
                            tool_temp = float(vibit2_data.get("temperature") or 0.0) if vibit2_data else 0.0
                            spindle_vibration = max([v for v in [
                                vibit1_data.get("x_rms_vel"), vibit1_data.get("y_rms_vel"), vibit1_data.get("z_rms_vel")
                            ] if v is not None] or [0.0]) if vibit1_data else 0.0
                            tool_vibration = max([v for v in [
                                vibit2_data.get("x_peak_vel"), vibit2_data.get("y_peak_vel"), vibit2_data.get("z_peak_vel")
                            ] if v is not None] or [0.0]) if vibit2_data else 0.0
                            curr_block = self.gcode_program[self.gcode_index % len(self.gcode_program)]
                            feed_rate = float(curr_block["feed"] if is_running and plc_connected else 0.0)
                            session.execute(text("""
                                INSERT INTO triac_sensor_data (
                                    time, machine_id, sensor_id,
                                    x_axis_value, y_axis_value, z_axis_value,
                                    x_axis_feed, y_axis_feed, z_axis_feed,
                                    spindle_speed, spindle_temperature, spindle_vibration,
                                    tool_temperature, tool_vibration, tool_number,
                                    led_red, led_yellow, led_green, safety_curtain_status
                                ) VALUES (
                                    :time, 'triac', :sensor_id,
                                    :x_val, :y_val, :z_val, :x_feed, :y_feed, :z_feed,
                                    :speed, :temp, :vib, :tool_temp, :tool_vib, :tool_num,
                                    :red, :yellow, :green, false
                                )
                            """), {
                                "time": now_dt, "sensor_id": plc_sensor_id,
                                "x_val": float(self.x_pos or 0.0), "y_val": float(self.y_pos or 0.0), "z_val": float(self.z_pos or 0.0),
                                "x_feed": feed_rate, "y_feed": feed_rate, "z_feed": feed_rate,
                                "speed": spindle_speed, "temp": spindle_temp, "vib": spindle_vibration,
                                "tool_temp": tool_temp, "tool_vib": tool_vibration, "tool_num": int(2 if is_running else 0),
                                "red": bool(not plc_connected), "yellow": bool(plc_connected and is_running), "green": bool(plc_connected and not is_running)
                            })

                        if vibit1_data and any(v is not None for v in vibit1_data.values()):
                            vibit1_sensor_id = sensors.get("triac_vibit1")
                            if vibit1_sensor_id:
                                session.execute(text("""
                                    INSERT INTO vibit_readings (time, machine_id, sensor_id, modbus_unit_id,
                                        x_rms_acc, y_rms_acc, z_rms_acc, x_rms_vel, y_rms_vel, z_rms_vel,
                                        x_peak_acc, y_peak_acc, z_peak_acc, x_peak_vel, y_peak_vel, z_peak_vel, temperature, rpm)
                                    VALUES (:time, 'triac', :sensor_id, 1,
                                        :x_rms, :y_rms, :z_rms, :x_vel, :y_vel, :z_vel,
                                        :x_peak, :y_peak, :z_peak, :x_pvel, :y_pvel, :z_pvel, :temp, :rpm)
                                """), {
                                    "time": now_dt, "sensor_id": vibit1_sensor_id,
                                    "x_rms": float(vibit1_data.get("x_rms_acc") or 0.0), "y_rms": float(vibit1_data.get("y_rms_acc") or 0.0), "z_rms": float(vibit1_data.get("z_rms_acc") or 0.0),
                                    "x_vel": float(vibit1_data.get("x_rms_vel") or 0.0), "y_vel": float(vibit1_data.get("y_rms_vel") or 0.0), "z_vel": float(vibit1_data.get("z_rms_vel") or 0.0),
                                    "x_peak": float(vibit1_data.get("x_peak_acc") or 0.0), "y_peak": float(vibit1_data.get("y_peak_acc") or 0.0), "z_peak": float(vibit1_data.get("z_peak_acc") or 0.0),
                                    "x_pvel": float(vibit1_data.get("x_peak_vel") or 0.0), "y_pvel": float(vibit1_data.get("y_peak_vel") or 0.0), "z_pvel": float(vibit1_data.get("z_peak_vel") or 0.0),
                                    "temp": float(vibit1_data.get("temperature") or 0.0), "rpm": float(vibit1_data.get("rpm") or 0.0)
                                })

                        if vibit2_data and any(v is not None for v in vibit2_data.values()):
                            vibit2_sensor_id = sensors.get("triac_vibit2")
                            if vibit2_sensor_id:
                                session.execute(text("""
                                    INSERT INTO vibit_readings (time, machine_id, sensor_id, modbus_unit_id,
                                        x_rms_acc, y_rms_acc, z_rms_acc, x_rms_vel, y_rms_vel, z_rms_vel,
                                        x_peak_acc, y_peak_acc, z_peak_acc, x_peak_vel, y_peak_vel, z_peak_vel, temperature, rpm)
                                    VALUES (:time, 'triac', :sensor_id, 2,
                                        :x_rms, :y_rms, :z_rms, :x_vel, :y_vel, :z_vel,
                                        :x_peak, :y_peak, :z_peak, :x_pvel, :y_pvel, :z_pvel, :temp, 0.0)
                                """), {
                                    "time": now_dt, "sensor_id": vibit2_sensor_id,
                                    "x_rms": float(vibit2_data.get("x_rms_acc") or 0.0), "y_rms": float(vibit2_data.get("y_rms_acc") or 0.0), "z_rms": float(vibit2_data.get("z_rms_acc") or 0.0),
                                    "x_vel": float(vibit2_data.get("x_rms_vel") or 0.0), "y_vel": float(vibit2_data.get("y_rms_vel") or 0.0), "z_vel": float(vibit2_data.get("z_rms_vel") or 0.0),
                                    "x_peak": float(vibit2_data.get("x_peak_acc") or 0.0), "y_peak": float(vibit2_data.get("y_peak_acc") or 0.0), "z_peak": float(vibit2_data.get("z_peak_acc") or 0.0),
                                    "x_pvel": float(vibit2_data.get("x_peak_vel") or 0.0), "y_pvel": float(vibit2_data.get("y_peak_vel") or 0.0), "z_pvel": float(vibit2_data.get("z_peak_vel") or 0.0),
                                    "temp": float(vibit2_data.get("temperature") or 0.0)
                                })

                        if vibit3_data and (vibit3_data.get("kwh") is not None or vibit3_data.get("power") is not None):
                            energy_sensor_id = sensors.get("triac_energy")
                            if energy_sensor_id:
                                power = float(vibit3_data.get("power") or 0.0)
                                session.execute(text("""
                                    INSERT INTO energy_meter_data (time, machine_id, sensor_id,
                                        average_voltage_ln, average_voltage_ll, average_current, total_net_kwh)
                                    VALUES (:time, 'triac', :sensor_id, 230.0, 400.0, :current, :kwh)
                                """), {"time": now_dt, "sensor_id": energy_sensor_id, "current": power / 230.0, "kwh": float(vibit3_data.get("kwh") or 0.0)})

                        session.commit()
                    except Exception as e:
                        logger.error(f"[TRIAC] DB log error: {e}")
                        session.rollback()
                    finally:
                        session.close()

            except Exception as e:
                logger.error(f"[TRIAC] Modbus poll error: {e}")

            await asyncio.sleep(8.0)

        logger.info("[TRIAC] Modbus poll loop stopped")

    async def _read_triac_data(self) -> Dict[str, Any] | None:
        """Build unified payload for frontend using real sensors from TRIAC.
        For the OPC UA connection, check gateway state.
        For coordinates, use physics simulation driven by spindle state.
        """
        try:
            plc_connected = triac_opcua_connection.connected

            # Use cached Modbus data (updated every 8s by _modbus_poll_loop)
            vibit1_data, vibit2_data, vibit3_data = copy.deepcopy(self._cached_modbus_data)

            # Initialize last-good cache from DB on first cycle (runs once)
            if not self._db_init_done:
                self._db_init_done = True
                await asyncio.to_thread(self._init_last_good_from_db)

            vibit1_connected = vibit1_data is not None
            vibit2_connected = vibit2_data is not None
            vibit3_connected = vibit3_data is not None

            # Update last good cache if read was successful
            if vibit1_connected:
                self._last_good_vibit1 = copy.deepcopy(vibit1_data)
            if vibit2_connected:
                self._last_good_vibit2 = copy.deepcopy(vibit2_data)
            if vibit3_connected:
                self._last_good_vibit3 = copy.deepcopy(vibit3_data)

            # Use last good cache as fallback for effective readings
            vibit1_effective = copy.deepcopy(self._last_good_vibit1) if self._last_good_vibit1 else {}
            vibit2_effective = copy.deepcopy(self._last_good_vibit2) if self._last_good_vibit2 else {}
            vibit3_effective = copy.deepcopy(self._last_good_vibit3) if self._last_good_vibit3 else {}

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
                        # If connected but key missing: use 0.0 (partial read)
                        # If disconnected and no cached value: use None (show "---")
                        # If disconnected but key already has a cached value: keep it (show last-good)
                        if connected:
                            data_dict[key] = 0.0
                        # else: leave as None if not present, keep existing value if present
                return data_dict

            vibit1_effective = fill_defaults(vibit1_effective, vibit1_connected or bool(self._last_good_vibit1))
            vibit2_effective = fill_defaults(vibit2_effective, vibit2_connected or bool(self._last_good_vibit2))

            # Spindle RPM
            vibit1_rpm = vibit1_effective.get("rpm")
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
                    "temperature": vibit1_effective.get("temperature"),
                    "vibration": max([v for v in [
                        vibit1_effective.get("x_rms_vel"),
                        vibit1_effective.get("y_rms_vel"),
                        vibit1_effective.get("z_rms_vel")
                    ] if v is not None]) if (vibit1_connected or self._last_good_vibit1 is not None) else None,
                },
                "tool": {
                    "number": 2 if is_running else 0,
                    "temperature": vibit2_effective.get("temperature"),
                    "vibration": max([v for v in [
                        vibit2_effective.get("x_peak_vel"),
                        vibit2_effective.get("y_peak_vel"),
                        vibit2_effective.get("z_peak_vel")
                    ] if v is not None]) if (vibit2_connected or self._last_good_vibit2 is not None) else None,
                    "reboot_count": vibit2_effective.get("reboot_count"),
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
                    "power": vibit3_effective.get("power"),
                    "kwh": vibit3_effective.get("kwh"),
                    "raw_power_regs": vibit3_effective.get("raw_power_regs"),
                    "raw_kwh_regs": vibit3_effective.get("raw_kwh_regs"),
                } if (vibit3_connected or self._last_good_vibit3 is not None) else None,
                "raw": {
                    "vibit1": vibit1_effective,
                    "vibit2": vibit2_effective,
                    "vibit3": vibit3_effective,
                },
            }
        except Exception as e:
            logger.error(f"Error reading triac data: {e}")
            return None

    async def _broadcast_loop(self):
        """Main broadcast loop for TRIAC — streams data at 10 Hz, sending only changed fields."""
        self.is_broadcasting = True
        HEARTBEAT_INTERVAL = 50  # ticks → 50 * 0.1s = 5 seconds
        logger.info("Triac broadcast loop started")

        try:
            while self.is_broadcasting and len(self.active_connections) > 0:
                data = await self._read_triac_data()
                if data:
                    self._heartbeat_tick += 1
                    is_first = not self._last_broadcast_payload

                    if is_first:
                        # Very first tick — send full snapshot to all clients
                        message = build_snapshot_message(data)
                        self._last_broadcast_payload = copy.deepcopy(data)
                        self._heartbeat_tick = 0
                    else:
                        delta = compute_delta(self._last_broadcast_payload, data)
                        # Force snapshot when fresh Modbus data just arrived
                        if self._modbus_data_fresh:
                            self._modbus_data_fresh = False
                            message = build_snapshot_message(data)
                            self._last_broadcast_payload = copy.deepcopy(data)
                            self._heartbeat_tick = 0
                        elif delta:
                            delta["timestamp"] = data["timestamp"]
                            message = build_delta_message(delta)
                            self._last_broadcast_payload = copy.deepcopy(data)
                            self._heartbeat_tick = 0
                        elif self._heartbeat_tick >= HEARTBEAT_INTERVAL:
                            message = build_heartbeat_message(data["timestamp"])
                            self._heartbeat_tick = 0
                        else:
                            await asyncio.sleep(0.1)
                            continue

                    disconnected = set()
                    for connection in self.active_connections:
                        try:
                            await connection.send_text(message)
                        except Exception as e:
                            logger.error(f"Error sending to Triac client: {e}")
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
            if self._modbus_task and not self._modbus_task.done():
                self._modbus_task.cancel()
            self.is_broadcasting = False
            logger.info("Triac broadcast loop stopped")


# Global broadcaster instance
triac_broadcaster = TriacBroadcaster()
