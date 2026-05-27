import asyncio
import json
from datetime import timedelta
from fastapi import WebSocket
from typing import Set
from backend.stations.assembly.hydraulic_station import opcua_connection, HYDRAULIC_DATA_TAGS
from backend.database.db import SessionLocal
from sqlalchemy import text
from backend.core.timezone import ist_now
from backend.core.delta import compute_delta, build_snapshot_message, build_delta_message, build_heartbeat_message
import logging

logger = logging.getLogger(__name__)

class HydraulicBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.is_broadcasting = False
        self.broadcast_task = None
        self.last_db_write_time = 0.0
        self._sensor_id_cached = None
        self.last_logged_state = None  # Tracks tuple: (bearing, shaft, red, orange, green, curtain, vice_close)
        self.last_connected = None  # Tracks boolean connection state
        self._node_cache: dict = {}
        self._last_broadcast_payload: dict = {}
        self._heartbeat_tick: int = 0
        
    async def connect(self, websocket: WebSocket):
        """Register a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Hydraulic WebSocket connected. Total connections: {len(self.active_connections)}")

        # Send last known snapshot to the new client so it isn't blank
        if self._last_broadcast_payload:
            try:
                await websocket.send_text(build_snapshot_message(self._last_broadcast_payload))
            except Exception:
                pass

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

    async def _log_connection_event_db(self, connected: bool, reason: str = None):
        """Write a connection/disconnection event to machine_connections."""
        def _write():
            sensor_id = self._get_sensor_id()
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

    async def _log_machine_event_db(self, event_type: str, severity: str, title: str, payload_data: dict = None):
        """Write a new machine event or alarm to machine_events."""
        def _write():
            sensor_id = self._get_sensor_id()
            if not sensor_id:
                return
            session = SessionLocal()
            try:
                session.execute(
                    text("""
                        INSERT INTO machine_events (time, machine_id, sensor_id, event_type, severity, title, payload)
                        VALUES (:time, 'assembly', :sensor_id, :event_type, :severity, :title, :payload)
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
                logger.error(f"Error logging machine event to DB: {e}")
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
            is_connected = opcua_connection.connected
            
            # Connection state transition logging
            if self.last_connected is None:
                self.last_connected = is_connected
                asyncio.create_task(self._log_connection_event_db(is_connected))
            elif is_connected != self.last_connected:
                self.last_connected = is_connected
                asyncio.create_task(self._log_connection_event_db(is_connected))
                
                title = "Assembly OPC-UA Session Connected" if is_connected else "Assembly OPC-UA Session Terminated"
                severity = "info" if is_connected else "critical"
                event_type = "info" if is_connected else "alarm"
                asyncio.create_task(self._log_machine_event_db(event_type, severity, title))

            if not is_connected:
                # Broadcast explicit offline state so the frontend can reflect
                # the disconnected condition rather than going silent.
                self._node_cache.clear()
                return self._disconnected_payload()

            data = {}
            def _read_tags(node_cache, client, tags):
                # Build cache if empty
                if not node_cache:
                    for tag_name, node_id in tags.items():
                        node_cache[tag_name] = client.get_node(f"ns=4;s={node_id}")
                result = {}
                for tag_name, node in list(node_cache.items()):
                    try:
                        result[tag_name] = node.get_value()
                    except Exception as e:
                        logger.warning(f"[Assembly] Failed to read {tag_name}: {e}")
                        result[tag_name] = None
                        node_cache.clear()  # invalidate on error
                        break
                return result

            try:
                data = await asyncio.to_thread(_read_tags, self._node_cache, opcua_connection.client, HYDRAULIC_DATA_TAGS)
            except Exception as e:
                logger.error(f"[Assembly] Error reading tags: {e}")
                data = {tag: None for tag in HYDRAULIC_DATA_TAGS}

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

            # State-change and heartbeat logging strategy
            now = asyncio.get_running_loop().time()
            current_state = (
                payload["assembly"]["bearing"],
                payload["assembly"]["shaft"],
                payload["safety"]["lights"]["red"],
                payload["safety"]["lights"]["orange"],
                payload["safety"]["lights"]["green"],
                payload["safety"]["curtain"],
                payload["vice"]["close"]
            )
            is_state_changed = (self.last_logged_state is None) or (current_state != self.last_logged_state)
            is_heartbeat_due = (now - self.last_db_write_time >= 2.0)

            # Edge-triggered machine events for safety triggers
            if self.last_logged_state is not None:
                prev_curtain = self.last_logged_state[5]
                current_curtain = current_state[5]
                if current_curtain and not prev_curtain:
                    asyncio.create_task(self._log_machine_event_db(
                        "alarm", "critical", "Safety Curtain Interrupted", 
                        {"curtain_interrupted": True}
                    ))
                elif not current_curtain and prev_curtain:
                    asyncio.create_task(self._log_machine_event_db(
                        "info", "info", "Safety Curtain Cleared", 
                        {"curtain_interrupted": False}
                    ))

                prev_red_led = self.last_logged_state[2]
                current_red_led = current_state[2]
                if current_red_led and not prev_red_led:
                    asyncio.create_task(self._log_machine_event_db(
                        "alarm", "warning", "Status Tower: Red Indicator Active",
                        {"light_red": True}
                    ))

            if is_state_changed or is_heartbeat_due:
                self.last_db_write_time = now
                self.last_logged_state = current_state
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
                    self._heartbeat_tick += 1
                    delta = compute_delta(self._last_broadcast_payload, data)

                    if not self._last_broadcast_payload or delta:
                        # First message or state changed — send snapshot on first, delta otherwise
                        if not self._last_broadcast_payload:
                            message = build_snapshot_message(data)
                        else:
                            message = build_delta_message(delta)
                        self._last_broadcast_payload = data
                    elif self._heartbeat_tick % 20 == 0:
                        # Every 2s (20 × 100ms), send a heartbeat to keep WS alive
                        message = build_heartbeat_message(data.get("timestamp", 0))
                    else:
                        message = None

                    if message:
                        disconnected = set()
                        for connection in self.active_connections:
                            try:
                                await connection.send_text(message)
                            except Exception as e:
                                logger.error(f"Error sending to client: {e}")
                                disconnected.add(connection)
                        for conn in disconnected:
                            self.disconnect(conn)
                
                # Wait before next update (100 ms — 10 Hz for responsive motion)
                await asyncio.sleep(0.1)
        
        except asyncio.CancelledError:
            logger.info("Hydraulic broadcast loop cancelled")
        except Exception as e:
            logger.error(f"Hydraulic broadcast loop error: {e}")
        finally:
            self.is_broadcasting = False
            logger.info("Hydraulic broadcast loop stopped")

# Global broadcaster instance
hydraulic_broadcaster = HydraulicBroadcaster()
