import asyncio
import logging
from queue import Queue, Empty
from typing import Dict, List, Any
from datetime import datetime, timezone

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import insert, text
from backend.database.db import SessionLocal
from backend.database.models import (
    VibitReading, MiracSensorData, TriacSensorData, 
    AmrSensorData, CobotSensorData, EnergyMeterData, AssemblyStationData
)

logger = logging.getLogger(__name__)

# Bounded, thread-safe queues for incoming data (prevents OOM on DB failure)
vibit_queue = Queue(maxsize=5000)
mirac_queue = Queue(maxsize=5000)
triac_queue = Queue(maxsize=5000)
assembly_queue = Queue(maxsize=5000)

BATCH_SIZE = 500  # Max records to insert in one go

# Cache to map legacy string IDs ('triac_vibit1') to actual sensor UUIDs
_sensor_cache: Dict[str, str] = {}
# Cache to map legacy string IDs to machine UUIDs
_machine_cache: Dict[str, str] = {}

def get_sensor_uuid(legacy_key: str) -> str | None:
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

def get_machine_uuid(machine_id: str) -> str | None:
    # Machine IDs are just TEXT in the new schema, but we cache anyway for future proofing
    return machine_id

def queue_vibit_reading(legacy_key: str, metrics: Dict):
    sensor_uuid = get_sensor_uuid(legacy_key)
    if not sensor_uuid:
        return
        
    reading = {
        "time": datetime.now(timezone.utc),
        "sensor_id": sensor_uuid,
        "modbus_unit_id": metrics.get("modbus_unit_id", 1), # Added this based on SQL
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
        pass

def queue_mirac_reading(machine_id: str, sensor_legacy_key: str, data: Dict):
    sensor_uuid = get_sensor_uuid(sensor_legacy_key)
    if not sensor_uuid:
        return
        
    reading = {
        "time": datetime.now(timezone.utc),
        "machine_id": machine_id,
        "sensor_id": sensor_uuid,
        "x_axis_value": float(data.get("x_axis_value", 0.0)),
        "y_axis_value": float(data.get("y_axis_value", 0.0)),
        "z_axis_value": float(data.get("z_axis_value", 0.0)),
        "x_axis_feed": float(data.get("x_axis_feed", 0.0)),
        "y_axis_feed": float(data.get("y_axis_feed", 0.0)),
        "z_axis_feed": float(data.get("z_axis_feed", 0.0)),
        "spindle_speed": float(data.get("spindle_speed", 0.0)),
        "spindle_temperature": float(data.get("spindle_temperature", data.get("spindle_temp", 0.0))),
        "spindle_vibration": float(data.get("spindle_vibration", 0.0)),
        "tool_number": int(data.get("tool_number", 0)),
        "tool_temperature": float(data.get("tool_temperature", data.get("tool_temp", 0.0))),
        "tool_vibration": float(data.get("tool_vibration", 0.0)),
        "led_red": bool(data.get("led_red", False)),
        "led_yellow": bool(data.get("led_yellow", False)),
        "led_green": bool(data.get("led_green", False)),
        "safety_curtain_status": bool(data.get("safety_curtain", False)),
    }
    try:
        mirac_queue.put_nowait(reading)
    except Exception:
        pass


def queue_triac_reading(machine_id: str, sensor_legacy_key: str, data: Dict):
    sensor_uuid = get_sensor_uuid(sensor_legacy_key)
    if not sensor_uuid:
        return
        
    reading = {
        "time": datetime.now(timezone.utc),
        "machine_id": machine_id,
        "sensor_id": sensor_uuid,
        "x_axis_value": float(data.get("x_axis_value", 0.0)),
        "y_axis_value": float(data.get("y_axis_value", 0.0)),
        "z_axis_value": float(data.get("z_axis_value", 0.0)),
        "x_axis_feed": float(data.get("x_axis_feed", 0.0)),
        "y_axis_feed": float(data.get("y_axis_feed", 0.0)),
        "z_axis_feed": float(data.get("z_axis_feed", 0.0)),
        "spindle_speed": float(data.get("spindle_speed", 0.0)),
        "spindle_temperature": float(data.get("spindle_temperature", data.get("spindle_temp", 0.0))),
        "spindle_vibration": float(data.get("spindle_vibration", 0.0)),
        "tool_number": int(data.get("tool_number", 0)),
        "tool_temperature": float(data.get("tool_temperature", data.get("tool_temp", 0.0))),
        "tool_vibration": float(data.get("tool_vibration", 0.0)),
        "led_red": bool(data.get("led_red", False)),
        "led_yellow": bool(data.get("led_yellow", False)),
        "led_green": bool(data.get("led_green", False)),
        "safety_curtain_status": bool(data.get("safety_curtain", False)),
    }
    try:
        triac_queue.put_nowait(reading)
    except Exception:
        pass


def queue_assembly_reading(machine_id: str, sensor_legacy_key: str, data: Dict):
    sensor_uuid = get_sensor_uuid(sensor_legacy_key)
    if not sensor_uuid:
        return
        
    reading = {
        "time": datetime.now(timezone.utc),
        "machine_id": machine_id,
        "sensor_id": sensor_uuid,
        "bearing_operation_status": bool(data.get("bearing_operation_status", False)),
        "shaft_operation_status": bool(data.get("shaft_operation_status", False)),
        "led_red": bool(data.get("led_red", False)),
        "led_yellow": bool(data.get("led_yellow", False)),
        "led_green": bool(data.get("led_green", False)),
        "safety_curtain_status": bool(data.get("safety_curtain", False)),
    }
    try:
        assembly_queue.put_nowait(reading)
    except Exception:
        pass


async def batch_writer_loop():
    """Background task to drain queues and insert records in batches."""
    logger.info("[DB] Started sensor data batch writer loop.")
    
    queues = [
        (vibit_queue, VibitReading),
        (mirac_queue, MiracSensorData),
        (triac_queue, TriacSensorData),
        (assembly_queue, AssemblyStationData)
    ]
    
    while True:
        await asyncio.sleep(2.0)  # Wake up every 2 seconds
        
        batches = []
        for q, model in queues:
            batch = []
            while not q.empty() and len(batch) < BATCH_SIZE:
                try:
                    batch.append(q.get_nowait())
                except Empty:
                    break
            if batch:
                batches.append((model, batch))
                
        if not batches:
            continue

        # Insert batches with retry backoff
        retry_delay = 1.0
        max_retries = 3
        
        for attempt in range(max_retries):
            try:
                with SessionLocal() as session:
                    for model, batch in batches:
                        session.execute(insert(model), batch)
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
