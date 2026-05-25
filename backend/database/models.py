import logging
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, SmallInteger, Text, JSON, ForeignKey, BigInteger, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .db import Base, engine
import uuid

logger = logging.getLogger(__name__)

# ── Asset Registry ─────────────────────────────────────────────────────────────

class Machine(Base):
    __tablename__ = "machines"
    machine_id = Column(Text, primary_key=True)
    display_name = Column(Text, nullable=False)
    machine_type = Column(Text, nullable=False)
    location = Column(Text)
    manufacturer = Column(Text)
    model = Column(Text)
    is_active = Column(Boolean, default=True)
    meta_data = Column("meta", JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    sensors = relationship("MachineSensor", back_populates="machine")
    events = relationship("MachineEvent", back_populates="machine")


class MachineSensor(Base):
    __tablename__ = "machine_sensors"
    sensor_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    machine_id = Column(Text, ForeignKey("machines.machine_id", ondelete="CASCADE"), nullable=False)
    name = Column(Text, nullable=False)
    protocol = Column(Text, nullable=False)
    host = Column(Text)
    port = Column(Integer)
    unit_id = Column(Integer)
    legacy_key = Column(Text, unique=True)
    is_active = Column(Boolean, default=True)
    meta_data = Column("meta", JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    machine = relationship("Machine", back_populates="sensors")


# ── Telemetry (Time-Series) ────────────────────────────────────────────────────

class VibitReading(Base):
    __tablename__ = "vibit_readings"
    time = Column(DateTime(timezone=True), primary_key=True, index=True)
    sensor_id = Column(UUID(as_uuid=True), ForeignKey("machine_sensors.sensor_id"), primary_key=True)
    x_rms_acc = Column(Float)
    y_rms_acc = Column(Float)
    z_rms_acc = Column(Float)
    x_rms_vel = Column(Float)
    y_rms_vel = Column(Float)
    z_rms_vel = Column(Float)
    x_peak_acc = Column(Float)
    y_peak_acc = Column(Float)
    z_peak_acc = Column(Float)
    x_peak_vel = Column(Float)
    y_peak_vel = Column(Float)
    z_peak_vel = Column(Float)
    temperature = Column(Float)
    rpm = Column(Float)
    led_status = Column(SmallInteger)


class OpcuaReading(Base):
    __tablename__ = "opcua_readings"
    time = Column(DateTime(timezone=True), primary_key=True, index=True)
    sensor_id = Column(UUID(as_uuid=True), ForeignKey("machine_sensors.sensor_id"), primary_key=True)
    tag_name = Column(Text, primary_key=True)
    value_num = Column(Float)
    value_bool = Column(Boolean)
    value_text = Column(Text)
    quality = Column(SmallInteger, default=0)


class MachineEvent(Base):
    __tablename__ = "machine_events"
    time = Column(DateTime(timezone=True), primary_key=True, server_default=func.now())
    machine_id = Column(Text, ForeignKey("machines.machine_id"), primary_key=True)
    sensor_id = Column(UUID(as_uuid=True), ForeignKey("machine_sensors.sensor_id"))
    event_type = Column(Text, nullable=False)
    severity = Column(Text)
    title = Column(Text, nullable=False)
    payload = Column(JSON)
    resolved_at = Column(DateTime(timezone=True))
    operator_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"))

    machine = relationship("Machine", back_populates="events")


class MachineConnection(Base):
    __tablename__ = "machine_connections"
    id = Column(BigInteger, primary_key=True)
    sensor_id = Column(UUID(as_uuid=True), ForeignKey("machine_sensors.sensor_id"), nullable=False)
    connected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    disconnected_at = Column(DateTime(timezone=True))
    disconnect_reason = Column(Text)
    simulated = Column(Boolean, default=False)


# ── Inventory & Orders ─────────────────────────────────────────────────────────

class StorageBox(Base):
    __tablename__ = "storage_boxes"
    box_id = Column(Text, primary_key=True)
    column_name = Column(String(1), nullable=False)
    row_number = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    compartments = relationship("StorageCompartment", back_populates="box")


class StorageItem(Base):
    __tablename__ = "storage_items"
    item_id = Column(Integer, primary_key=True)
    sku = Column(Text, unique=True)
    name = Column(Text, nullable=False)
    description = Column(Text)
    unit = Column(Text, default="pcs")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class StorageCompartment(Base):
    __tablename__ = "storage_compartments"
    compartment_id = Column(Text, primary_key=True)
    box_id = Column(Text, ForeignKey("storage_boxes.box_id", ondelete="CASCADE"), nullable=False)
    sub_slot = Column(String(1), nullable=False)
    item_id = Column(Integer, ForeignKey("storage_items.item_id"))
    quantity = Column(Integer, default=0)
    status = Column(Text, nullable=False, default="empty")
    updated_at = Column(DateTime(timezone=True), server_default=func.now())

    box = relationship("StorageBox", back_populates="compartments")
    item = relationship("StorageItem")


class StorageTransaction(Base):
    __tablename__ = "storage_transactions"
    tran_id = Column(BigInteger, primary_key=True)
    time = Column(DateTime(timezone=True), server_default=func.now())
    compartment_id = Column(Text, ForeignKey("storage_compartments.compartment_id"))
    item_id = Column(Integer, ForeignKey("storage_items.item_id"))
    action = Column(Text, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    operator_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id"))
    request_id = Column(UUID(as_uuid=True))
    asrs_command = Column(Text)
    asrs_result = Column(Text)
    notes = Column(Text)


class ShuttleMovement(Base):
    __tablename__ = "shuttle_movements"
    id = Column(BigInteger, primary_key=True)
    time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    command = Column(Text, nullable=False)
    from_row = Column(Integer)
    from_col = Column(Text)
    to_row = Column(Integer)
    to_col = Column(Text)
    state = Column(Text, nullable=False)
    duration_ms = Column(Integer)
    result = Column(Text)
    initiated_by = Column(Text)


class Order(Base):
    __tablename__ = "orders"
    order_id = Column(Integer, primary_key=True)
    customer_name = Column(Text, nullable=False)
    customer_email = Column(Text, nullable=False)
    customer_phone = Column(Text, nullable=False)
    shipping_address = Column(Text, nullable=False)
    order_status = Column(Text, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    items = relationship("OrderItem", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"
    order_item_id = Column(Integer, primary_key=True)
    order_id = Column(Integer, ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False)
    item_id = Column(Integer, ForeignKey("storage_items.item_id", ondelete="RESTRICT"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    order = relationship("Order", back_populates="items")
    item = relationship("StorageItem")


class User(Base):
    __tablename__ = "users"
    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(Text, nullable=False, unique=True)
    name = Column(Text, nullable=False)
    password_hash = Column(Text, nullable=False, default="CHANGE_ME")
    role = Column(Text, nullable=False, default="viewer")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))


def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("[DB] Tables created or verified successfully.")
    except Exception as e:
        logger.error(f"[DB] Failed to create tables: {e}")
