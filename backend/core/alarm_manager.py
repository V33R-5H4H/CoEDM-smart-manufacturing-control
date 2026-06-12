import logging
from typing import List, Callable, Dict, Any, Optional
from datetime import datetime
from backend.database.db import SessionLocal
from backend.core.timezone import ist_now
from sqlalchemy import text
import asyncio
import json

logger = logging.getLogger(__name__)

class AlarmManager:
    """
    Singleton AlarmManager that handles:
    1. Error logging to the machine_events DB table
    2. Active alarm tracking in memory
    3. WebSocket notification callbacks
    """
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(AlarmManager, cls).__new__(cls)
            cls._instance._init()
        return cls._instance

    def _init(self):
        self.active_alarms: List[Dict[str, Any]] = []
        self._callbacks: List[Callable] = []
        # Populate active_alarms from DB on startup
        self._load_active_alarms_from_db()

    def _load_active_alarms_from_db(self):
        """Loads unresolved alarms from the database into memory."""
        session = SessionLocal()
        try:
            rows = session.execute(text("""
                SELECT time, machine_id, sensor_id, event_type, severity, title, payload
                FROM machine_events
                WHERE resolved_at IS NULL AND event_type IN ('alarm', 'error', 'warning')
                ORDER BY time DESC
            """)).fetchall()
            
            for row in rows:
                self.active_alarms.append({
                    "time": row.time.isoformat() if row.time else None,
                    "machine_id": row.machine_id,
                    "sensor_id": str(row.sensor_id) if row.sensor_id else None,
                    "event_type": row.event_type,
                    "severity": row.severity,
                    "title": row.title,
                    "payload": row.payload
                })
        except Exception as e:
            logger.error(f"[AlarmManager] Failed to load active alarms from DB: {e}")
        finally:
            session.close()

    def register_callback(self, callback: Callable):
        """Register a callback (e.g. from a WebSocket broadcaster) to be notified on alarm updates."""
        if callback not in self._callbacks:
            self._callbacks.append(callback)

    def _trigger_callbacks(self, alarm_data: Dict[str, Any], action: str):
        """Helper to invoke all registered callbacks asynchronously or synchronously."""
        event = {
            "type": "alarm_update",
            "action": action, # 'raised' or 'resolved'
            "alarm": alarm_data
        }
        for cb in self._callbacks:
            try:
                # If the callback is an async function
                if asyncio.iscoroutinefunction(cb):
                    # We create a task if we are in an event loop
                    try:
                        loop = asyncio.get_running_loop()
                        loop.create_task(cb(event))
                    except RuntimeError:
                        # No running loop, use asyncio.run
                        asyncio.run(cb(event))
                else:
                    cb(event)
            except Exception as e:
                logger.error(f"[AlarmManager] Error calling callback: {e}")

    def raise_alarm(self, machine_id: str, title: str, severity: str = "critical", 
                    payload: Optional[Dict[str, Any]] = None, sensor_id: Optional[str] = None):
        """
        Raise a new alarm.
        Writes to DB, appends to active list, and calls callbacks.
        """
        now = ist_now()
        session = SessionLocal()
        try:
            session.execute(text("""
                INSERT INTO machine_events (time, machine_id, sensor_id, event_type, severity, title, payload)
                VALUES (:time, :machine_id, :sensor_id, 'alarm', :severity, :title, :payload)
            """), {
                "time": now,
                "machine_id": machine_id,
                "sensor_id": sensor_id,
                "severity": severity,
                "title": title,
                "payload": json.dumps(payload) if payload else None
            })
            session.commit()
            
            alarm_data = {
                "time": now.isoformat(),
                "machine_id": machine_id,
                "sensor_id": sensor_id,
                "event_type": "alarm",
                "severity": severity,
                "title": title,
                "payload": payload
            }
            self.active_alarms.append(alarm_data)
            logger.error(f"[AlarmManager] Raised Alarm for {machine_id}: {title}")
            
            self._trigger_callbacks(alarm_data, action="raised")
            
        except Exception as e:
            logger.error(f"[AlarmManager] DB Error raising alarm: {e}")
            session.rollback()
        finally:
            session.close()

    def resolve_alarm(self, machine_id: str, title: str):
        """
        Resolve an active alarm.
        Marks it resolved in DB, removes from active list, and calls callbacks.
        """
        now = ist_now()
        session = SessionLocal()
        try:
            # Update DB
            res = session.execute(text("""
                UPDATE machine_events 
                SET resolved_at = :now 
                WHERE machine_id = :machine_id AND title = :title AND resolved_at IS NULL
            """), {
                "now": now,
                "machine_id": machine_id,
                "title": title
            })
            session.commit()

            if res.rowcount > 0:
                # Remove from in-memory list
                original_len = len(self.active_alarms)
                self.active_alarms = [
                    a for a in self.active_alarms 
                    if not (a.get("machine_id") == machine_id and a.get("title") == title)
                ]
                
                if len(self.active_alarms) < original_len:
                    logger.info(f"[AlarmManager] Resolved Alarm for {machine_id}: {title}")
                    
                    alarm_data = {
                        "machine_id": machine_id,
                        "title": title,
                        "resolved_at": now.isoformat()
                    }
                    self._trigger_callbacks(alarm_data, action="resolved")
            
        except Exception as e:
            logger.error(f"[AlarmManager] DB Error resolving alarm: {e}")
            session.rollback()
        finally:
            session.close()

# Expose a global instance
alarm_manager = AlarmManager()
