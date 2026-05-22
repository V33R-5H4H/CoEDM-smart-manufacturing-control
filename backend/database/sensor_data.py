import asyncio
import logging
from queue import Queue, Empty
from typing import Dict, List
import threading

from sqlalchemy.exc import SQLAlchemyError
from backend.database.db import SessionLocal
from backend.database.models import VibitReading, OpcuaReading

logger = logging.getLogger(__name__)

# Thread-safe queues for incoming data
vibit_queue = Queue()
opcua_queue = Queue()

BATCH_SIZE = 500  # Max records to insert in one go

def queue_vibit_reading(sensor_id: str, metrics: Dict):
    """Enqueue a VIBIT reading to be saved to the database asynchronously."""
    # Create a clean dictionary matching the SQLAlchemy model
    reading = {
        "sensor_id": sensor_id,
        "x_rms_acceleration": metrics.get("x_rms_acceleration", 0.0),
        "y_rms_acceleration": metrics.get("y_rms_acceleration", 0.0),
        "z_rms_acceleration": metrics.get("z_rms_acceleration", 0.0),
        "x_rms_velocity": metrics.get("x_rms_velocity", 0.0),
        "y_rms_velocity": metrics.get("y_rms_velocity", 0.0),
        "z_rms_velocity": metrics.get("z_rms_velocity", 0.0),
        "x_peak_acceleration": metrics.get("x_peak_acceleration", 0.0),
        "y_peak_acceleration": metrics.get("y_peak_acceleration", 0.0),
        "z_peak_acceleration": metrics.get("z_peak_acceleration", 0.0),
        "x_peak_velocity": metrics.get("x_peak_velocity", 0.0),
        "y_peak_velocity": metrics.get("y_peak_velocity", 0.0),
        "z_peak_velocity": metrics.get("z_peak_velocity", 0.0),
        "temperature": metrics.get("temperature", 0.0),
    }
    vibit_queue.put(reading)


def queue_opcua_reading(station_id: str, tag_name: str, value: any):
    """Enqueue an OPC-UA reading to be saved to the database asynchronously."""
    reading = {
        "station_id": station_id,
        "tag_name": tag_name,
        "value": str(value),
    }
    opcua_queue.put(reading)


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

        # Insert batches
        try:
            with SessionLocal() as session:
                if vibit_batch:
                    session.bulk_insert_mappings(VibitReading, vibit_batch)
                if opcua_batch:
                    session.bulk_insert_mappings(OpcuaReading, opcua_batch)
                session.commit()
                # logger.debug(f"[DB] Inserted {len(vibit_batch)} VIBIT and {len(opcua_batch)} OPC-UA records.")
        except SQLAlchemyError as e:
            logger.error(f"[DB] Batch insert failed: {e}")
