import asyncio
import copy
import logging
import time
from typing import Dict, Any, Set
from fastapi import WebSocket
from backend.communication.vibit_modbus import VibitModbusReader
from backend.config import settings
from backend.stations.triac.cnc_triac_station import opcua_connection as triac_opcua_connection
from backend.stations.triac.cnc_triac_station import TRIAC_DATA_TAGS
from backend.database.db import SessionLocal
from sqlalchemy import text
from backend.core.timezone import ist_now
import orjson

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
        self.last_connected = None  # Tracks OPC-UA connection state for edge-triggered event logging
        self.last_plc_connected = None  # Tracks PLC connection state
        self._node_cache = {}  # Cache for OPC UA node handles
        # Delta-send state
        self._last_broadcast_payload: dict = {}
        self._heartbeat_tick: int = 0

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

    async def _log_machine_event_db(self, event_type: str, severity: str, title: str, payload_data: dict = None):
        """Write a new machine event or alarm to machine_events."""
        def _write():
            sensors = self._get_sensor_ids()
            sensor_id = sensors.get("triac")
            if not sensor_id:
                return
            from backend.database.db import SessionLocal
            from sqlalchemy import text
            from backend.core.timezone import ist_now
            session = SessionLocal()
            try:
                session.execute(
                    text("""
                        INSERT INTO machine_events (time, machine_id, sensor_id, event_type, severity, title, payload)
                        VALUES (:time, 'triac', :sensor_id, :event_type, :severity, :title, :payload)
                    """),
                    {
                        "time": ist_now(),
                        "sensor_id": sensor_id,
                        "event_type": event_type,
                        "severity": severity,
                        "title": title,
                        "payload": orjson.dumps(payload_data).decode("utf-8") if payload_data else None
                    }
                )
                session.commit()
            except Exception as e:
                logger.error(f"Error logging machine event to DB: {e}")
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
                logger.error(f"Error logging connection event to DB: {e}")
                session.rollback()
            finally:
                session.close()
        await asyncio.to_thread(_write)

    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        try:
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
        except Exception as e:
            logger.error(f"Error in Triac WebSocket connect: {e}")
            self.disconnect(websocket)

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

    async def _read_plc_data(self) -> dict:
        """Read current TRIAC PLC data from OPC UA server."""
        if not triac_opcua_connection.connected:
            return {}
        
        def _read_all_tags(node_cache):
            """Synchronous OPC-UA reads — run in thread pool."""
            if not node_cache:
                try:
                    for tag_name, node_id in TRIAC_DATA_TAGS.items():
                        node_cache[tag_name] = triac_opcua_connection.client.get_node(node_id)
                except Exception as e:
                    logger.warning(f"[TRIAC] Failed to build node cache: {e}")
                    node_cache.clear()
                    return {}
            
            result = {}
            fail_count = 0
            for tag_name, node in list(node_cache.items()):
                try:
                    value = node.read_value()
                    result[tag_name] = value
                except Exception as e:
                    fail_count += 1
                    logger.debug(f"[TRIAC] Failed to read tag {tag_name}: {e}")
                    # Don't fail the whole read if only some tags fail
                    continue
            
            if fail_count >= len(TRIAC_DATA_TAGS):
                # All tags failed — probably a connection issue
                logger.warning(f"[TRIAC] All OPC UA reads failed")
                node_cache.clear()
                return {}
            
            return result
        
        try:
            plc_data = await asyncio.to_thread(_read_all_tags, self._node_cache)
            return plc_data
        except Exception as e:
            logger.error(f"[TRIAC] Failed to read PLC data: {e}")
            self._node_cache.clear()
            return {}

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
                    plc_connected = triac_opcua_connection.connected
                    now_dt = ist_now()
                    # Read PLC data for real axis positions (outside of _write)
                    plc_data = await self._read_plc_data()
                    
                    def _write():
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
                                x_val = float(plc_data.get("x_axis_value", 0.0))
                                y_val = float(plc_data.get("y_axis_value", 0.0))
                                z_val = float(plc_data.get("z_axis_value", 0.0))
                                tool_num = int(plc_data.get("tool_number", 0))
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
                                    "x_val": x_val, "y_val": y_val, "z_val": z_val,
                                    "x_feed": 0.0, "y_feed": 0.0, "z_feed": 0.0,
                                    "speed": spindle_speed, "temp": spindle_temp, "vib": spindle_vibration,
                                    "tool_temp": tool_temp, "tool_vib": tool_vibration, "tool_num": tool_num,
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
                    await asyncio.to_thread(_write)

            except Exception as e:
                logger.error(f"[TRIAC] Modbus poll error: {e}")

            await asyncio.sleep(8.0)

        logger.info("[TRIAC] Modbus poll loop stopped")

    async def _read_triac_data(self) -> Dict[str, Any] | None:
        """Build unified payload for frontend using real sensors from TRIAC."""
        try:
            # Read PLC data
            plc_data = await self._read_plc_data()
            plc_connected = bool(plc_data)

            # Edge-triggered OPC-UA connection state logging
            if self.last_plc_connected is None:
                self.last_plc_connected = plc_connected
                asyncio.create_task(self._log_connection_event_db("triac", plc_connected))
            elif plc_connected != self.last_plc_connected:
                self.last_plc_connected = plc_connected
                title = "TRIAC PLC Connected" if plc_connected else "TRIAC PLC Session Terminated"
                asyncio.create_task(self._log_connection_event_db("triac", plc_connected))
                asyncio.create_task(self._log_machine_event_db(
                    "info" if plc_connected else "alarm",
                    "info" if plc_connected else "critical",
                    title
                ))

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

            # Connection state transition logging for VibIT 1 (Spindle)
            if hasattr(self, 'last_vibit1_connected'):
                if self.last_vibit1_connected is None:
                    self.last_vibit1_connected = vibit1_connected
                    asyncio.create_task(self._log_connection_event_db("triac_vibit1", vibit1_connected))
                elif vibit1_connected != self.last_vibit1_connected:
                    self.last_vibit1_connected = vibit1_connected
                    asyncio.create_task(self._log_connection_event_db("triac_vibit1", vibit1_connected))
                    title = "TRIAC Spindle VibIT Online" if vibit1_connected else "TRIAC Spindle VibIT Offline (Gateway Timeout)"
                    asyncio.create_task(self._log_machine_event_db("triac_vibit1", "info" if vibit1_connected else "alarm", "info" if vibit1_connected else "critical", title))
            else:
                self.last_vibit1_connected = vibit1_connected
                asyncio.create_task(self._log_connection_event_db("triac_vibit1", vibit1_connected))

            # Connection state transition logging for VibIT 2 (Tool)
            if hasattr(self, 'last_vibit2_connected'):
                if self.last_vibit2_connected is None:
                    self.last_vibit2_connected = vibit2_connected
                    asyncio.create_task(self._log_connection_event_db("triac_vibit2", vibit2_connected))
                elif vibit2_connected != self.last_vibit2_connected:
                    self.last_vibit2_connected = vibit2_connected
                    asyncio.create_task(self._log_connection_event_db("triac_vibit2", vibit2_connected))
                    title = "TRIAC Tool VibIT Online" if vibit2_connected else "TRIAC Tool VibIT Offline (Gateway Timeout)"
                    asyncio.create_task(self._log_machine_event_db("triac_vibit2", "info" if vibit2_connected else "alarm", "info" if vibit2_connected else "critical", title))
            else:
                self.last_vibit2_connected = vibit2_connected
                asyncio.create_task(self._log_connection_event_db("triac_vibit2", vibit2_connected))

            # Connection state transition logging for VibIT 3 (Energy Meter)
            if hasattr(self, 'last_vibit3_connected'):
                if self.last_vibit3_connected is None:
                    self.last_vibit3_connected = vibit3_connected
                    asyncio.create_task(self._log_connection_event_db("triac_energy", vibit3_connected))
                elif vibit3_connected != self.last_vibit3_connected:
                    self.last_vibit3_connected = vibit3_connected
                    asyncio.create_task(self._log_connection_event_db("triac_energy", vibit3_connected))
                    title = "TRIAC Energy Meter Online" if vibit3_connected else "TRIAC Energy Meter Offline (Gateway Timeout)"
                    asyncio.create_task(self._log_machine_event_db("triac_energy", "info" if vibit3_connected else "alarm", "info" if vibit3_connected else "critical", title))
            else:
                self.last_vibit3_connected = vibit3_connected
                asyncio.create_task(self._log_connection_event_db("triac_energy", vibit3_connected))

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
                        if connected:
                            data_dict[key] = 0.0
                return data_dict

            vibit1_effective = fill_defaults(vibit1_effective, vibit1_connected or bool(self._last_good_vibit1))
            vibit2_effective = fill_defaults(vibit2_effective, vibit2_connected or bool(self._last_good_vibit2))

            # Spindle RPM
            vibit1_rpm = vibit1_effective.get("rpm")
            spindle_speed = vibit1_rpm if vibit1_rpm is not None else (plc_data.get("spindle_speed") if plc_connected else None)
            is_running = spindle_speed > 0 if spindle_speed is not None else False

            # Get real axis values from PLC
            x_axis_value = plc_data.get("x_axis_value") if plc_connected else None
            y_axis_value = plc_data.get("y_axis_value") if plc_connected else None
            z_axis_value = plc_data.get("z_axis_value") if plc_connected else None
            tool_number = plc_data.get("tool_number") if plc_connected else None

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
                    "number": tool_number,
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
                        "value": x_axis_value,
                        "feed": 0.0,
                    },
                    "y": {
                        "value": y_axis_value,
                        "feed": 0.0,
                    },
                    "z": {
                        "value": z_axis_value,
                        "feed": 0.0,
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
