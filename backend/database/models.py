import logging
from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.sql import func
from .db import Base, engine

logger = logging.getLogger(__name__)

class VibitReading(Base):
    __tablename__ = "vibit_readings"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    sensor_id = Column(String(50), index=True)
    x_rms_acceleration = Column(Float, default=0.0)
    y_rms_acceleration = Column(Float, default=0.0)
    z_rms_acceleration = Column(Float, default=0.0)
    x_rms_velocity = Column(Float, default=0.0)
    y_rms_velocity = Column(Float, default=0.0)
    z_rms_velocity = Column(Float, default=0.0)
    x_peak_acceleration = Column(Float, default=0.0)
    y_peak_acceleration = Column(Float, default=0.0)
    z_peak_acceleration = Column(Float, default=0.0)
    x_peak_velocity = Column(Float, default=0.0)
    y_peak_velocity = Column(Float, default=0.0)
    z_peak_velocity = Column(Float, default=0.0)
    temperature = Column(Float, default=0.0)


class OpcuaReading(Base):
    __tablename__ = "opcua_readings"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    station_id = Column(String(50), index=True)
    tag_name = Column(String(100), index=True)
    value = Column(String(255))  # Store as string for flexibility, or we can use JSON


def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("[DB] Tables created or verified successfully.")
    except Exception as e:
        logger.error(f"[DB] Failed to create tables: {e}")
