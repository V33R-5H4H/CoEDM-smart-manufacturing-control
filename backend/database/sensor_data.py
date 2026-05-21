"""
backend/database/sensor_data.py — Sensor Data Storage
======================================================
Stores time-series sensor readings from OPC-UA and Modbus sources.

Tables:
  - asrs_led_history      : LED state changes per box (edge-triggered)
  - asrs_shuttle_history   : Shuttle state changes (edge-triggered)
  - hydraulic_readings     : Periodic hydraulic sensor snapshots
  - mirac_plc_readings    : Periodic MIRAC PLC snapshots
  - vibit_readings         : Periodic VIBIT vibration sensor snapshots

All writes use raw SQL via db_session() to avoid ORM overhead.
This module is intentionally decoupled from the rest of the codebase.
Import and call the write functions from broadcasters or station code.
"""

import logging
from datetime import datetime, timezone
from contextlib import contextmanager

from sqlalchemy import text
from backend.database.db import SessionLocal, engine, Base

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Table creation (run once via init_sensor_tables.py)
# ═══════════════════════════════════════════════════════════════════════════════

TABLE_SQL = {
    "asrs_led_history": """
        CREATE TABLE IF NOT EXISTS sensor_asrs_led_history (
            id          BIGSERIAL PRIMARY KEY,
            box_id      VARCHAR(5)  NOT NULL,
            active      BOOLEAN     NOT NULL,
            prev_active BOOLEAN     NOT NULL,
            changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_led_history_box_time
            ON sensor_asrs_led_history (box_id, changed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_led_history_time
            ON sensor_asrs_led_history (changed_at DESC);
    """,

    "asrs_shuttle_history": """
        CREATE TABLE IF NOT EXISTS sensor_asrs_shuttle_history (
            id              BIGSERIAL PRIMARY KEY,
            row_num         INT         NOT NULL,
            column_letter   VARCHAR(1)  NOT NULL,
            state           VARCHAR(20) NOT NULL,
            command         VARCHAR(20),
            recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_shuttle_history_time
            ON sensor_asrs_shuttle_history (recorded_at DESC);
    """,

    "hydraulic_readings": """
        CREATE TABLE IF NOT EXISTS sensor_hydraulic_readings (
            id                  BIGSERIAL PRIMARY KEY,
            bearing_on          BOOLEAN     NOT NULL DEFAULT FALSE,
            shaft_on            BOOLEAN     NOT NULL DEFAULT FALSE,
            displacement_mm     REAL        NOT NULL DEFAULT 0.0,
            vice_open           BOOLEAN     NOT NULL DEFAULT FALSE,
            vice_close          BOOLEAN     NOT NULL DEFAULT FALSE,
            buzzer              BOOLEAN     NOT NULL DEFAULT FALSE,
            safety_curtain      BOOLEAN     NOT NULL DEFAULT FALSE,
            light_red           BOOLEAN     NOT NULL DEFAULT FALSE,
            light_orange        BOOLEAN     NOT NULL DEFAULT FALSE,
            light_green         BOOLEAN     NOT NULL DEFAULT FALSE,
            connected           BOOLEAN     NOT NULL DEFAULT FALSE,
            recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_hydraulic_time
            ON sensor_hydraulic_readings (recorded_at DESC);
    """,

    "mirac_plc_readings": """
        CREATE TABLE IF NOT EXISTS sensor_mirac_plc_readings (
            id                  BIGSERIAL PRIMARY KEY,
            led_red             BOOLEAN     NOT NULL DEFAULT FALSE,
            led_yellow          BOOLEAN     NOT NULL DEFAULT FALSE,
            led_green           BOOLEAN     NOT NULL DEFAULT FALSE,
            spindle_speed       REAL        NOT NULL DEFAULT 0.0,
            spindle_temp        REAL        NOT NULL DEFAULT 0.0,
            spindle_vibration   REAL        NOT NULL DEFAULT 0.0,
            tool_number         INT         NOT NULL DEFAULT 0,
            tool_temp           REAL        NOT NULL DEFAULT 0.0,
            tool_vibration      REAL        NOT NULL DEFAULT 0.0,
            x_axis_value        REAL        NOT NULL DEFAULT 0.0,
            z_axis_value        REAL        NOT NULL DEFAULT 0.0,
            x_axis_feed         REAL        NOT NULL DEFAULT 0.0,
            z_axis_feed         REAL        NOT NULL DEFAULT 0.0,
            cycle_start         BOOLEAN     NOT NULL DEFAULT FALSE,
            cycle_stop          BOOLEAN     NOT NULL DEFAULT FALSE,
            pneumatic_chuck     BOOLEAN     NOT NULL DEFAULT FALSE,
            connected           BOOLEAN     NOT NULL DEFAULT FALSE,
            recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mirac_plc_time
            ON sensor_mirac_plc_readings (recorded_at DESC);
    """,

    "vibit_readings": """
        CREATE TABLE IF NOT EXISTS sensor_vibit_readings (
            id                  BIGSERIAL PRIMARY KEY,
            x_rms_acceleration  REAL    NOT NULL DEFAULT 0.0,
            y_rms_acceleration  REAL    NOT NULL DEFAULT 0.0,
            z_rms_acceleration  REAL    NOT NULL DEFAULT 0.0,
            x_rms_velocity      REAL    NOT NULL DEFAULT 0.0,
            y_rms_velocity      REAL    NOT NULL DEFAULT 0.0,
            z_rms_velocity      REAL    NOT NULL DEFAULT 0.0,
            x_peak_acceleration REAL    NOT NULL DEFAULT 0.0,
            y_peak_acceleration REAL    NOT NULL DEFAULT 0.0,
            z_peak_acceleration REAL    NOT NULL DEFAULT 0.0,
            x_peak_velocity     REAL    NOT NULL DEFAULT 0.0,
            y_peak_velocity     REAL    NOT NULL DEFAULT 0.0,
            z_peak_velocity     REAL    NOT NULL DEFAULT 0.0,
            temperature         REAL    NOT NULL DEFAULT 0.0,
            rpm                 REAL    NOT NULL DEFAULT 0.0,
            led_status          INT     NOT NULL DEFAULT 0,
            reboot_count        INT     NOT NULL DEFAULT 0,
            recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_vibit_time
            ON sensor_vibit_readings (recorded_at DESC);
    """,
}


def create_sensor_tables():
    """Create all sensor data tables if they not exist. Safe to call multiple times."""
    with engine.connect() as conn:
        for table_name, sql in TABLE_SQL.items():
            try:
                conn.execute(text(sql))
                conn.commit()
                logger.info("[SensorData] Table ready: %s", table_name)
            except Exception as exc:
                conn.rollback()
                logger.error("[SensorData] Failed creating %s: %s", table_name, exc)
                raise


# ═══════════════════════════════════════════════════════════════════════════════
# Write functions — call these from broadcasters / station code
# ═══════════════════════════════════════════════════════════════════════════════

@contextmanager
def _session():
    """Short-lived session for a single write."""
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


# ── ASRS LED ──────────────────────────────────────────────────────────────────

def write_led_change(box_id: str, active: bool, prev_active: bool):
    """Record an LED state transition. Call from LEDService callback."""
    try:
        with _session() as s:
            s.execute(
                text("""
                    INSERT INTO sensor_asrs_led_history (box_id, active, prev_active, changed_at)
                    VALUES (:box_id, :active, :prev_active, :ts)
                """),
                {"box_id": box_id, "active": active, "prev_active": prev_active,
                 "ts": datetime.now(timezone.utc)},
            )
    except Exception as exc:
        logger.error("[SensorData] LED write failed for %s: %s", box_id, exc)


# ── ASRS Shuttle ──────────────────────────────────────────────────────────────

def write_shuttle_state(row_num: int, column_letter: str, state: str, command: str | None):
    """Record a shuttle state change. Call from ShuttleState.set_* methods."""
    try:
        with _session() as s:
            s.execute(
                text("""
                    INSERT INTO sensor_asrs_shuttle_history
                        (row_num, column_letter, state, command, recorded_at)
                    VALUES (:row, :col, :state, :cmd, :ts)
                """),
                {"row": row_num, "col": column_letter, "state": state,
                 "cmd": command, "ts": datetime.now(timezone.utc)},
            )
    except Exception as exc:
        logger.error("[SensorData] Shuttle write failed: %s", exc)


# ── Hydraulic ─────────────────────────────────────────────────────────────────

def write_hydraulic_reading(data: dict):
    """
    Record a hydraulic sensor snapshot.
    Call from HydraulicBroadcaster._broadcast_loop every N seconds.

    data keys: bearing, shaft, displacement_mm, vice_open, vice_close,
               buzzer, curtain, lights (dict with red/orange/green), connected
    """
    try:
        lights = data.get("lights", {})
        with _session() as s:
            s.execute(
                text("""
                    INSERT INTO sensor_hydraulic_readings
                        (bearing_on, shaft_on, displacement_mm, vice_open, vice_close,
                         buzzer, safety_curtain, light_red, light_orange, light_green,
                         connected, recorded_at)
                    VALUES (:bearing, :shaft, :disp, :vopen, :vclose,
                            :buzzer, :curtain, :lred, :lorange, :lgreen,
                            :connected, :ts)
                """),
                {
                    "bearing": data.get("bearing", False),
                    "shaft": data.get("shaft", False),
                    "disp": data.get("displacement_mm", 0.0),
                    "vopen": data.get("vice_open", False),
                    "vclose": data.get("vice_close", False),
                    "buzzer": data.get("buzzer", False),
                    "curtain": data.get("curtain", False),
                    "lred": lights.get("red", False),
                    "lorange": lights.get("orange", False),
                    "lgreen": lights.get("green", False),
                    "connected": data.get("connected", False),
                    "ts": datetime.now(timezone.utc),
                },
            )
    except Exception as exc:
        logger.error("[SensorData] Hydraulic write failed: %s", exc)


# ── MIRAC PLC ─────────────────────────────────────────────────────────────────

def write_mirac_plc_reading(data: dict, connected: bool):
    """
    Record a MIRAC PLC snapshot.
    Call from MiracBroadcaster._broadcast_loop every N seconds.

    data keys: led_red, led_yellow, led_green, spindle_speed, spindle_temp,
               spindle_vibration, tool_number, tool_temp, tool_vibration,
               x_axis_value, z_axis_value, x_axis_feed, z_axis_feed,
               cycle_start, cycle_stop, pneumatic_chuck
    """
    try:
        with _session() as s:
            s.execute(
                text("""
                    INSERT INTO sensor_mirac_plc_readings
                        (led_red, led_yellow, led_green, spindle_speed, spindle_temp,
                         spindle_vibration, tool_number, tool_temp, tool_vibration,
                         x_axis_value, z_axis_value, x_axis_feed, z_axis_feed,
                         cycle_start, cycle_stop, pneumatic_chuck, connected, recorded_at)
                    VALUES (:lr, :ly, :lg, :spd, :stemp, :svib, :tnum, :ttemp, :tvib,
                            :xval, :zval, :xfeed, :zfeed,
                            :cstart, :cstop, :pneu, :connected, :ts)
                """),
                {
                    "lr": data.get("led_red", False),
                    "ly": data.get("led_yellow", False),
                    "lg": data.get("led_green", False),
                    "spd": data.get("spindle_speed", 0.0),
                    "stemp": data.get("spindle_temp", 0.0),
                    "svib": data.get("spindle_vibration", 0.0),
                    "tnum": data.get("tool_number", 0),
                    "ttemp": data.get("tool_temp", 0.0),
                    "tvib": data.get("tool_vibration", 0.0),
                    "xval": data.get("x_axis_value", 0.0),
                    "zval": data.get("z_axis_value", 0.0),
                    "xfeed": data.get("x_axis_feed", 0.0),
                    "zfeed": data.get("z_axis_feed", 0.0),
                    "cstart": data.get("cycle_start", False),
                    "cstop": data.get("cycle_stop", False),
                    "pneu": data.get("pneumatic_chuck", False),
                    "connected": connected,
                    "ts": datetime.now(timezone.utc),
                },
            )
    except Exception as exc:
        logger.error("[SensorData] MIRAC PLC write failed: %s", exc)


# ── VIBIT Vibration ───────────────────────────────────────────────────────────

def write_vibit_reading(data: dict):
    """
    Record a VIBIT vibration snapshot.
    Call from MiracBroadcaster._broadcast_loop every N seconds.

    data keys: x_rms_acc, y_rms_acc, z_rms_acc, x_rms_vel, y_rms_vel, z_rms_vel,
               x_peak_acc, y_peak_acc, z_peak_acc, x_peak_vel, y_peak_vel, z_peak_vel,
               temperature, rpm, led_status, reboot_count
    """
    try:
        with _session() as s:
            s.execute(
                text("""
                    INSERT INTO sensor_vibit_readings
                        (x_rms_acceleration, y_rms_acceleration, z_rms_acceleration,
                         x_rms_velocity, y_rms_velocity, z_rms_velocity,
                         x_peak_acceleration, y_peak_acceleration, z_peak_acceleration,
                         x_peak_velocity, y_peak_velocity, z_peak_velocity,
                         temperature, rpm, led_status, reboot_count, recorded_at)
                    VALUES (:xra, :yra, :zra, :xrv, :yrv, :zrv,
                            :xpa, :ypa, :zpa, :xpv, :ypv, :zpv,
                            :temp, :rpm, :led, :reboot, :ts)
                """),
                {
                    "xra": data.get("x_rms_acc", 0.0),
                    "yra": data.get("y_rms_acc", 0.0),
                    "zra": data.get("z_rms_acc", 0.0),
                    "xrv": data.get("x_rms_vel", 0.0),
                    "yrv": data.get("y_rms_vel", 0.0),
                    "zrv": data.get("z_rms_vel", 0.0),
                    "xpa": data.get("x_peak_acc", 0.0),
                    "ypa": data.get("y_peak_acc", 0.0),
                    "zpa": data.get("z_peak_acc", 0.0),
                    "xpv": data.get("x_peak_vel", 0.0),
                    "ypv": data.get("y_peak_vel", 0.0),
                    "zpv": data.get("z_peak_vel", 0.0),
                    "temp": data.get("temperature", 0.0),
                    "rpm": data.get("rpm", 0.0),
                    "led": data.get("led_status", 0),
                    "reboot": data.get("reboot_count", 0),
                    "ts": datetime.now(timezone.utc),
                },
            )
    except Exception as exc:
        logger.error("[SensorData] VIBIT write failed: %s", exc)
