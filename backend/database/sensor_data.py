import asyncio
import logging
from queue import Queue, Empty
from typing import Dict, List, Any
from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import insert, text
from backend.database.db import SessionLocal
from backend.database.models import VibitReading, OpcuaReading

logger = logging.getLogger(__name__)

# Bounded, thread-safe queues for incoming data (prevents OOM on DB failure)
vibit_queue = Queue(maxsize=5000)
opcua_queue = Queue(maxsize=5000)

BATCH_SIZE = 500  # Max records to insert in one go

# Cache to map legacy string IDs ('triac_vibit1') to actual sensor UUIDs
_sensor_cache: Dict[str, str] = {}

def get_sensor_uuid(legacy_key: str) -> str | None:
    """Look up a sensor's UUID by its legacy_key (e.g. 'mirac', 'triac_vibit1')."""
    if legacy_key in _sensor_cache:
        return _sensor_cache[legacy_key]

    try:
        with SessionLocal() as session:
            row = session.execute(
                text("SELECT sensor_id FROM machine_sensors WHERE legacy_key = :key"),
                {"key": legacy_key}
            ).fetchone()
            if row:
                uuid_str = str(row[0])
                _sensor_cache[legacy_key] = uuid_str
                return uuid_str
    except Exception as e:
        logger.error(f"[DB] Failed to lookup sensor UUID for {legacy_key}: {e}")
    
    return None

def queue_vibit_reading(legacy_key: str, metrics: Dict):
    """Enqueue a VIBIT reading to be saved to the database asynchronously."""
    sensor_uuid = get_sensor_uuid(legacy_key)
    if not sensor_uuid:
        # Avoid filling the queue with unmappable data
        return
        
    reading = {
        "time": datetime.now(timezone.utc),
        "sensor_id": sensor_uuid,
        "x_rms_acc": metrics.get("x_rms_acc", metrics.get("x_rms_acceleration", 0.0)),
        "y_rms_acc": metrics.get("y_rms_acc", metrics.get("y_rms_acceleration", 0.0)),
        "z_rms_acc": metrics.get("z_rms_acc", metrics.get("z_rms_acceleration", 0.0)),
        "x_rms_vel": metrics.get("x_rms_vel", metrics.get("x_rms_velocity", 0.0)),
        "y_rms_vel": metrics.get("y_rms_vel", metrics.get("y_rms_velocity", 0.0)),
        "z_rms_vel": metrics.get("z_rms_vel", metrics.get("z_rms_velocity", 0.0)),
        "x_peak_acc": metrics.get("x_peak_acc", metrics.get("x_peak_acceleration", 0.0)),
        "y_peak_acc": metrics.get("y_peak_acc", metrics.get("y_peak_acceleration", 0.0)),
        "z_peak_acc": metrics.get("z_peak_acc", metrics.get("z_peak_acceleration", 0.0)),
        "x_peak_vel": metrics.get("x_peak_vel", metrics.get("x_peak_velocity", 0.0)),
        "y_peak_vel": metrics.get("y_peak_vel", metrics.get("y_peak_velocity", 0.0)),
        "z_peak_vel": metrics.get("z_peak_vel", metrics.get("z_peak_velocity", 0.0)),
        "temperature": metrics.get("temperature", 0.0),
        "rpm": metrics.get("rpm", 0.0),
        "led_status": int(metrics.get("led_status", 0)),
    }
    
    try:
        vibit_queue.put_nowait(reading)
    except Exception:
        # Queue full — backpressure handling (drop data instead of crashing)
        pass

def queue_opcua_reading(legacy_key: str, tag_name: str, value: Any):
    """Enqueue an OPC-UA reading to be saved to the database asynchronously."""
    sensor_uuid = get_sensor_uuid(legacy_key)
    if not sensor_uuid:
        return
        
    reading = {
        "time": datetime.now(timezone.utc),
        "sensor_id": sensor_uuid,
        "tag_name": tag_name,
        "value_num": None,
        "value_bool": None,
        "value_text": None,
        "quality": 0,
    }
    
    # Map the value to the correct typed column
    if isinstance(value, bool):
        reading["value_bool"] = value
    elif isinstance(value, (int, float)):
        reading["value_num"] = float(value)
    else:
        reading["value_text"] = str(value)
        
    try:
        opcua_queue.put_nowait(reading)
    except Exception:
        pass


async def batch_writer_loop():
    """Background task to drain queues and insert records in batches."""
    logger.info("[DB] Started sensor data batch writer loop.")
    
    while True:
        await asyncio.sleep(2.0)  # Wake up every 2 seconds
        
        # Drain VIBIT queue
        vibit_batch = []
        while not vibit_queue.empty() and len(vibit_batch) < BATCH_SIZE:
            try:
                vibit_batch.append(vibit_queue.get_nowait())
            except Empty:
                break
                
        # Drain OPC-UA queue
        opcua_batch = []
        while not opcua_queue.empty() and len(opcua_batch) < BATCH_SIZE:
            try:
                opcua_batch.append(opcua_queue.get_nowait())
            except Empty:
                break
                
        if not vibit_batch and not opcua_batch:
            continue

        # Insert batches with retry backoff in case of DB glitch
        retry_delay = 1.0
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                with SessionLocal() as session:
                    if vibit_batch:
                        session.execute(insert(VibitReading), vibit_batch)
                    if opcua_batch:
                        session.execute(insert(OpcuaReading), opcua_batch)
                    session.commit()
                # Success - break out of retry loop
                break
            except SQLAlchemyError as e:
                logger.error(f"[DB] Batch insert failed (attempt {attempt+1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                else:
                    logger.error("[DB] Dropping batch due to persistent DB errors.")
