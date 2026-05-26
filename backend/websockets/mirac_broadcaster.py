import asyncio
import copy
import json
import time
from fastapi import WebSocket
from typing import Set
from backend.stations.mirac.cnc_mirac_station import opcua_connection, MIRAC_DATA_TAGS
from backend.communication.vibit_modbus import VibitModbusReader
from backend.database.db import SessionLocal
from sqlalchemy import text
from backend.core.timezone import ist_now
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
            base_address=4001,
            register_type="holding"
        )
        self.vibit_reader_2 = VibitModbusReader(
            host=settings.VIBIT_HOST,
            port=settings.VIBIT_PORT,
            device_id=settings.VIBIT_UNIT_ID_2,
            base_address=4001,
            register_type="holding"
        )
        self.vibit_reader_3 = VibitModbusReader(
            host=settings.VIBIT_HOST,
            port=settings.VIBIT_PORT,
            device_id=settings.VIBIT_UNIT_ID_3,
            base_address=4000,
            register_type="input"
        )
        self._last_modbus_read_time = 0.0
        self._cached_modbus_data = (None, None, None)
        self._sensor_ids_cached = None
        self.last_plc_connected = None
        self.last_vibit1_connected = None
        self.last_vibit2_connected = None
        self.last_vibit3_connected = None
        self.last_safety_curtain = None
        self.last_red_led = None
        self._last_good_vibit1 = None
        self._last_good_vibit2 = None
        self._last_good_vibit3 = None
        
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
    
    def _get_sensor_ids(self) -> dict:
        """Resolve sensor UUIDs dynamically."""
        if self._sensor_ids_cached:
            return self._sensor_ids_cached
            
        session = SessionLocal()
        try:
            rows = session.execute(
                text("SELECT sensor_id, legacy_key FROM machine_sensors WHERE machine_id = 'mirac' OR machine_id = 'triac'")
            ).fetchall()
            self._sensor_ids_cached = {row[1]: str(row[0]) for row in rows}
            return self._sensor_ids_cached
        except Exception as e:
            logger.error(f"Error resolving mirac sensors: {e}")
            return {}
        finally:
            session.close()

    def _init_last_good_from_db(self):
        """Load initial last good values from the database at startup."""
        sensors = self._get_sensor_ids()
        if not sensors:
            return

        session = SessionLocal()
        try:
            # 1. Load Spindle VibIT 1
            vibit1_id = sensors.get("mirac_vibit1")
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
                    logger.info("[MiracBroadcaster] Loaded initial Spindle VibIT 1 data from DB")

            # 2. Load Tool VibIT 2
            vibit2_id = sensors.get("mirac_vibit2")
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
                    logger.info("[MiracBroadcaster] Loaded initial Tool VibIT 2 data from DB")

            # 3. Load Energy Meter VibIT 3
            energy_id = sensors.get("mirac_energy")
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
                    logger.info("[MiracBroadcaster] Loaded initial Energy Meter data from DB")
        except Exception as e:
            logger.error(f"Error loading initial Modbus data from DB: {e}")
        finally:
            session.close()

    async def _log_to_db(self, plc_data: dict, vibit1_data: dict, vibit2_data: dict, vibit3_data: dict):
        """Log MIRAC PLC, VibITs, and Energy Meter data to PostgreSQL in a background thread."""
        def _write():
            sensors = self._get_sensor_ids()
            if not sensors:
                return
                
            session = SessionLocal()
            try:
                now_dt = ist_now()
                
                # 1. Log to mirac_sensor_data (if PLC active)
                if plc_data:
                    plc_sensor_id = sensors.get("mirac")
                    if plc_sensor_id:
                        session.execute(
                            text("""
                                INSERT INTO mirac_sensor_data (
                                    time, machine_id, sensor_id,
                                    x_axis_value, y_axis_value, z_axis_value,
                                    x_axis_feed, y_axis_feed, z_axis_feed,
                                    spindle_speed, spindle_temperature, spindle_vibration,
                                    tool_temperature, tool_vibration, tool_number,
                                    led_red, led_yellow, led_green, safety_curtain_status
                                )
                                VALUES (
                                    :time, 'mirac', :sensor_id,
                                    :x_val, 0.0, :z_val,
                                    :x_feed, 0.0, :z_feed,
                                    :speed, :temp, :vib,
                                    :tool_temp, :tool_vib, :tool_num,
                                    :red, :yellow, :green, :curtain
                                )
                            """),
                            {
                                "time": now_dt,
                                "sensor_id": plc_sensor_id,
                                "x_val": float(plc_data.get("x_axis_value") or 0.0),
                                "z_val": float(plc_data.get("z_axis_value") or 0.0),
                                "x_feed": float(plc_data.get("x_axis_feed") or 0.0),
                                "z_feed": float(plc_data.get("z_axis_feed") or 0.0),
                                "speed": float(plc_data.get("spindle_speed") or 0.0),
                                "temp": float(plc_data.get("spindle_temp") or 0.0),
                                "vib": float(plc_data.get("spindle_vibration") or 0.0),
                                "tool_temp": float(plc_data.get("tool_temp") or 0.0),
                                "tool_vib": float(plc_data.get("tool_vibration") or 0.0),
                                "tool_num": int(plc_data.get("tool_number") or 1),
                                "red": bool(plc_data.get("led_red") or False),
                                "yellow": bool(plc_data.get("led_yellow") or False),
                                "green": bool(plc_data.get("led_green") or False),
                                "curtain": bool(plc_data.get("safety_curtain") or False)
                            }
                        )
                        
                # 2. Log to vibit_readings for Spindle (VibIT 1)
                if vibit1_data and any(v is not None for v in vibit1_data.values()):
                    vibit1_sensor_id = sensors.get("mirac_vibit1")
                    if vibit1_sensor_id:
                        session.execute(
                            text("""
                                INSERT INTO vibit_readings (
                                    time, machine_id, sensor_id, modbus_unit_id,
                                    x_rms_acc, y_rms_acc, z_rms_acc,
                                    x_peak_acc, y_peak_acc, z_peak_acc,
                                    temperature, rpm
                                )
                                VALUES (
                                    :time, 'mirac', :sensor_id, 1,
                                    :x_rms, :y_rms, :z_rms,
                                    :x_peak, :y_peak, :z_peak,
                                    :temp, :rpm
                                )
                            """),
                            {
                                "time": now_dt,
                                "sensor_id": vibit1_sensor_id,
                                "x_rms": float(vibit1_data.get("x_rms_acc") or 0.0),
                                "y_rms": float(vibit1_data.get("y_rms_acc") or 0.0),
                                "z_rms": float(vibit1_data.get("z_rms_acc") or 0.0),
                                "x_peak": float(vibit1_data.get("x_peak_acc") or 0.0),
                                "y_peak": float(vibit1_data.get("y_peak_acc") or 0.0),
                                "z_peak": float(vibit1_data.get("z_peak_acc") or 0.0),
                                "temp": float(vibit1_data.get("temperature") or 0.0),
                                "rpm": float(vibit1_data.get("rpm") or 0.0)
                            }
                        )

                # 3. Log to vibit_readings for Tool (VibIT 2)
                if vibit2_data and any(v is not None for v in vibit2_data.values()):
                    vibit2_sensor_id = sensors.get("mirac_vibit2")
                    if vibit2_sensor_id:
                        session.execute(
                            text("""
                                INSERT INTO vibit_readings (
                                    time, machine_id, sensor_id, modbus_unit_id,
                                    x_rms_acc, y_rms_acc, z_rms_acc,
                                    x_peak_acc, y_peak_acc, z_peak_acc,
                                    temperature, rpm
                                )
                                VALUES (
                                    :time, 'mirac', :sensor_id, 2,
                                    :x_rms, :y_rms, :z_rms,
                                    :x_peak, :y_peak, :z_peak,
                                    :temp, 0.0
                                )
                            """),
                            {
                                "time": now_dt,
                                "sensor_id": vibit2_sensor_id,
                                "x_rms": float(vibit2_data.get("x_rms_acc") or 0.0),
                                "y_rms": float(vibit2_data.get("y_rms_acc") or 0.0),
                                "z_rms": float(vibit2_data.get("z_rms_acc") or 0.0),
                                "x_peak": float(vibit2_data.get("x_peak_acc") or 0.0),
                                "y_peak": float(vibit2_data.get("y_peak_acc") or 0.0),
                                "z_peak": float(vibit2_data.get("z_peak_acc") or 0.0),
                                "temp": float(vibit2_data.get("temperature") or 0.0)
                            }
                        )

                # 4. Log to energy_meter_data (VibIT 3)
                if vibit3_data and (vibit3_data.get("kwh") is not None or vibit3_data.get("power") is not None):
                    energy_sensor_id = sensors.get("mirac_energy")
                    if energy_sensor_id:
                        power = float(vibit3_data.get("power") or 0.0)
                        session.execute(
                            text("""
                                INSERT INTO energy_meter_data (
                                    time, machine_id, sensor_id,
                                    average_voltage_ln, average_voltage_ll, average_current,
                                    total_net_kwh
                                )
                                VALUES (
                                    :time, 'mirac', :sensor_id,
                                    230.0, 400.0, :current,
                                    :kwh
                                )
                            """),
                            {
                                "time": now_dt,
                                "sensor_id": energy_sensor_id,
                                "current": power / 230.0,
                                "kwh": float(vibit3_data.get("kwh") or 0.0)
                            }
                        )

                session.commit()
            except Exception as e:
                logger.error(f"Error logging mirac data to DB: {e}")
                session.rollback()
            finally:
                session.close()

        await asyncio.to_thread(_write)

    async def _log_connection_event_db(self, sensor_key: str, connected: bool, reason: str = None):
        """Write a connection/disconnection event for a specific sensor to machine_connections."""
        def _write():
            from datetime import timedelta
            sensors = self._get_sensor_ids()
            sensor_id = sensors.get(sensor_key)
            if not sensor_id:
                return
            session = SessionLocal()
            try:
                now = ist_now()
                if connected:
                    # Log a new connection record
                    session.execute(
                        text("""
                            INSERT INTO machine_connections (sensor_id, connected_at, disconnected_at, disconnect_reason, simulated)
                            VALUES (:sensor_id, :connected_at, NULL, NULL, False)
                        """),
                        {"sensor_id": sensor_id, "connected_at": now}
                    )
                else:
                    # Log a new disconnection record or update the latest connection record
                    latest = session.execute(
                        text("""
                            SELECT id FROM machine_connections 
                            WHERE sensor_id = :sensor_id AND disconnected_at IS NULL 
                            ORDER BY connected_at DESC LIMIT 1
                        """),
                        {"sensor_id": sensor_id}
                    ).fetchone()
                    
                    if latest:
                        session.execute(
                            text("""
                                UPDATE machine_connections 
                                SET disconnected_at = :disconnected_at, disconnect_reason = :reason
                                WHERE id = :id
                            """),
                            {"disconnected_at": now, "reason": reason or "Client request / timeout", "id": latest[0]}
                        )
                    else:
                        session.execute(
                            text("""
                                INSERT INTO machine_connections (sensor_id, connected_at, disconnected_at, disconnect_reason, simulated)
                                VALUES (:sensor_id, :connected_at, :disconnected_at, :reason, False)
                            """),
                            {"sensor_id": sensor_id, "connected_at": now - timedelta(minutes=1), "disconnected_at": now, "reason": reason or "Disconnected"}
                        )
                session.commit()
            except Exception as e:
                logger.error(f"Error logging connection event for {sensor_key}: {e}")
                session.rollback()
            finally:
                session.close()
        await asyncio.to_thread(_write)

    async def _log_machine_event_db(self, sensor_key: str, event_type: str, severity: str, title: str, payload_data: dict = None):
        """Write a new machine event or alarm to machine_events."""
        def _write():
            sensors = self._get_sensor_ids()
            sensor_id = sensors.get(sensor_key)
            if not sensor_id:
                return
            session = SessionLocal()
            try:
                session.execute(
                    text("""
                        INSERT INTO machine_events (time, machine_id, sensor_id, event_type, severity, title, payload)
                        VALUES (:time, 'mirac', :sensor_id, :event_type, :severity, :title, :payload)
                    """),
                    {
                        "time": ist_now(),
                        "sensor_id": sensor_id,
                        "event_type": event_type,
                        "severity": severity,
                        "title": title,
                        "payload": json.dumps(payload_data) if payload_data else None
                    }
                )
                session.commit()
            except Exception as e:
                logger.error(f"Error logging machine event for {sensor_key}: {e}")
                session.rollback()
            finally:
                session.close()
        await asyncio.to_thread(_write)

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

            # Connection state transition logging for PLC
            if self.last_plc_connected is None:
                self.last_plc_connected = plc_connected
                asyncio.create_task(self._log_connection_event_db("mirac", plc_connected))
            elif plc_connected != self.last_plc_connected:
                self.last_plc_connected = plc_connected
                asyncio.create_task(self._log_connection_event_db("mirac", plc_connected))
                
                title = "MIRAC PLC Connected" if plc_connected else "MIRAC PLC Session Terminated"
                severity = "info" if plc_connected else "critical"
                event_type = "info" if plc_connected else "alarm"
                asyncio.create_task(self._log_machine_event_db("mirac", event_type, severity, title))

            # Safety triggers edge transitions
            if plc_connected:
                curtain_active = bool(plc_data.get("safety_curtain", False))
                if self.last_safety_curtain is None:
                    self.last_safety_curtain = curtain_active
                elif curtain_active != self.last_safety_curtain:
                    self.last_safety_curtain = curtain_active
                    if curtain_active:
                        asyncio.create_task(self._log_machine_event_db("mirac", "alarm", "critical", "Safety Curtain Interrupted", {"curtain_interrupted": True}))
                    else:
                        asyncio.create_task(self._log_machine_event_db("mirac", "info", "info", "Safety Curtain Cleared", {"curtain_interrupted": False}))

                red_active = bool(plc_data.get("led_red", False))
                if self.last_red_led is None:
                    self.last_red_led = red_active
                elif red_active != self.last_red_led:
                    self.last_red_led = red_active
                    if red_active:
                        asyncio.create_task(self._log_machine_event_db("mirac", "alarm", "warning", "Status Tower: Red Indicator Active", {"light_red": True}))

            # Throttle physical Modbus reads to a rate of 0.5 Hz (every 2.0s) to relax the RS485 serial network
            now = time.time()
            if now - self._last_modbus_read_time >= 2.0:
                self._last_modbus_read_time = now
                vibit1_data = await asyncio.to_thread(self.vibit_reader_1.read_snapshot)
                await asyncio.sleep(0.1)
                vibit2_data = await asyncio.to_thread(self.vibit_reader_2.read_snapshot)
                await asyncio.sleep(0.1)
                vibit3_data = await asyncio.to_thread(self.vibit_reader_3.read_energy_snapshot, False)
                self._cached_modbus_data = (vibit1_data, vibit2_data, vibit3_data)
                
                # Write to DB inside the Modbus 2.0s read tick!
                asyncio.create_task(self._log_to_db(plc_data, vibit1_data or {}, vibit2_data or {}, vibit3_data or {}))
            else:
                vibit1_data, vibit2_data, vibit3_data = copy.deepcopy(self._cached_modbus_data)

            # Lazy initialize from DB if not already done
            if self._last_good_vibit1 is None or self._last_good_vibit2 is None or self._last_good_vibit3 is None:
                self._init_last_good_from_db()

            # Track which sensors are actually connected
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

            # Connection state transition logging for VibIT 1 (Spindle)
            if self.last_vibit1_connected is None:
                self.last_vibit1_connected = vibit1_connected
                asyncio.create_task(self._log_connection_event_db("mirac_vibit1", vibit1_connected))
            elif vibit1_connected != self.last_vibit1_connected:
                self.last_vibit1_connected = vibit1_connected
                asyncio.create_task(self._log_connection_event_db("mirac_vibit1", vibit1_connected))
                
                title = "MIRAC Spindle VibIT Online" if vibit1_connected else "MIRAC Spindle VibIT Offline (Gateway Timeout)"
                severity = "info" if vibit1_connected else "critical"
                event_type = "info" if vibit1_connected else "alarm"
                asyncio.create_task(self._log_machine_event_db("mirac_vibit1", event_type, severity, title))

            # Connection state transition logging for VibIT 2 (Tool)
            if self.last_vibit2_connected is None:
                self.last_vibit2_connected = vibit2_connected
                asyncio.create_task(self._log_connection_event_db("mirac_vibit2", vibit2_connected))
            elif vibit2_connected != self.last_vibit2_connected:
                self.last_vibit2_connected = vibit2_connected
                asyncio.create_task(self._log_connection_event_db("mirac_vibit2", vibit2_connected))
                
                title = "MIRAC Tool VibIT Online" if vibit2_connected else "MIRAC Tool VibIT Offline (Gateway Timeout)"
                severity = "info" if vibit2_connected else "critical"
                event_type = "info" if vibit2_connected else "alarm"
                asyncio.create_task(self._log_machine_event_db("mirac_vibit2", event_type, severity, title))

            # Connection state transition logging for VibIT 3 (Energy Meter)
            if self.last_vibit3_connected is None:
                self.last_vibit3_connected = vibit3_connected
                asyncio.create_task(self._log_connection_event_db("mirac_energy", vibit3_connected))
            elif vibit3_connected != self.last_vibit3_connected:
                self.last_vibit3_connected = vibit3_connected
                asyncio.create_task(self._log_connection_event_db("mirac_energy", vibit3_connected))
                
                title = "MIRAC Energy Meter Online" if vibit3_connected else "MIRAC Energy Meter Offline (Gateway Timeout)"
                severity = "info" if vibit3_connected else "critical"
                event_type = "info" if vibit3_connected else "alarm"
                asyncio.create_task(self._log_machine_event_db("mirac_energy", event_type, severity, title))

            # Use last good cache as fallback for effective readings
            vibit1_effective = copy.deepcopy(self._last_good_vibit1) if self._last_good_vibit1 else {}
            vibit2_effective = copy.deepcopy(self._last_good_vibit2) if self._last_good_vibit2 else {}
            vibit3_effective = copy.deepcopy(self._last_good_vibit3) if self._last_good_vibit3 else {}

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

            vibit1_effective = fill_defaults(vibit1_effective, vibit1_connected or bool(self._last_good_vibit1))
            vibit2_effective = fill_defaults(vibit2_effective, vibit2_connected or bool(self._last_good_vibit2))

            # 1. Spindle metrics (from VibIT 1 — real sensor data only)
            vibit1_temp = vibit1_effective.get("temperature")
            vibit1_rpm = vibit1_effective.get("rpm")
            vibit1_rms_vel = [
                vibit1_effective.get("x_rms_vel"),
                vibit1_effective.get("y_rms_vel"),
                vibit1_effective.get("z_rms_vel"),
            ]
            rms_vel_1_values = [v for v in vibit1_rms_vel if v is not None]

            # 2. Tool metrics (from VibIT 2 — real sensor data only)
            vibit2_temp = vibit2_effective.get("temperature")
            vibit2_peak_vel = [
                vibit2_effective.get("x_peak_vel"),
                vibit2_effective.get("y_peak_vel"),
                vibit2_effective.get("z_peak_vel"),
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
                    "reboot_count": vibit2_effective.get("reboot_count", None),
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
                    "power": vibit3_effective.get("power"),
                    "kwh": vibit3_effective.get("kwh"),
                    "raw_power_regs": vibit3_effective.get("raw_power_regs"),
                    "raw_kwh_regs": vibit3_effective.get("raw_kwh_regs"),
                } if (vibit3_connected or self._last_good_vibit3 is not None) else None,
                "raw": {
                    "vibit1": vibit1_effective,
                    "vibit2": vibit2_effective,
                    "vibit3": vibit3_effective,
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
