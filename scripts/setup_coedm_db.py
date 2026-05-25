#!/usr/bin/env python3
"""
scripts/setup_coedm_db.py — CoEDM Platform Database Setup & Migration
======================================================================
Creates the new `coedm_platform` PostgreSQL database, applies the full
schema (16 tables + TimescaleDB hypertables), seeds static data, and
migrates existing data from `inventory_management`.

Usage:
    python scripts/setup_coedm_db.py
    python scripts/setup_coedm_db.py --update-env
    python scripts/setup_coedm_db.py --skip-migrate
    python scripts/setup_coedm_db.py --dry-run

Options:
    --update-env    Rewrite DATABASE_URL in backend/.env to point at new DB
    --skip-migrate  Skip copying data from inventory_management (fresh start)
    --dry-run       Print SQL statements without executing anything
    --drop-first    Drop coedm_platform if it exists before recreating
"""

import argparse
import sys
import re
from pathlib import Path
from urllib.parse import urlparse, unquote

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

try:
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    from psycopg2.extras import execute_values
except ImportError:
    print("❌  psycopg2 not found. Run:  pip install psycopg2-binary")
    sys.exit(1)

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).resolve().parent.parent
ENV_FILE   = ROOT / "backend" / ".env"
NEW_DB     = "coedm_platform"

# ── Console helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):   print(f"  {GREEN}✓{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}")
def err(msg):  print(f"  {RED}✗{RESET}  {msg}")
def info(msg): print(f"  {CYAN}→{RESET}  {msg}")
def head(msg): print(f"\n{BOLD}{msg}{RESET}")
def rule():    print("  " + "─" * 66)


# ══════════════════════════════════════════════════════════════════════════════
#  1.  Parse .env
# ══════════════════════════════════════════════════════════════════════════════
def parse_env() -> dict:
    """Read backend/.env and return a dict of key→value pairs."""
    if not ENV_FILE.exists():
        err(f"backend/.env not found at {ENV_FILE}")
        sys.exit(1)
    env = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            # Strip inline comments
            if "#" in line:
                line = line.split("#")[0].strip()
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def parse_db_url(url: str) -> dict:
    """Parse a PostgreSQL SQLAlchemy URL into connection params."""
    parsed = urlparse(url)
    return {
        "host":     parsed.hostname or "localhost",
        "port":     parsed.port or 5432,
        "user":     unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "dbname":   parsed.path.lstrip("/"),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  2.  Connection helpers
# ══════════════════════════════════════════════════════════════════════════════
def connect(params: dict, dbname: str = None) -> psycopg2.extensions.connection:
    p = dict(params)
    if dbname:
        p["dbname"] = dbname
    return psycopg2.connect(**p)


def exec_sql(cur, sql: str, params=None, dry_run: bool = False):
    sql = sql.strip()
    if dry_run:
        print(f"    [DRY-RUN] {sql[:120]}")
        return
    if params:
        cur.execute(sql, params)
    else:
        cur.execute(sql)


# ══════════════════════════════════════════════════════════════════════════════
#  3.  Schema SQL
# ══════════════════════════════════════════════════════════════════════════════
SCHEMA_SQL = """
-- ── Utility function ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── TABLE 1: machines ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machines (
    machine_id    TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    machine_type  TEXT NOT NULL
                  CHECK (machine_type IN (
                      'cnc_lathe','cnc_mill','hydraulic_press',
                      'asrs','amr','cobot','other'
                  )),
    location      TEXT,
    manufacturer  TEXT,
    model         TEXT,
    is_active     BOOLEAN DEFAULT TRUE,
    meta          JSONB,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE 2: machine_sensors ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_sensors (
    sensor_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id    TEXT NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    protocol      TEXT NOT NULL
                  CHECK (protocol IN ('opcua','modbus_tcp','tcp_raw','mqtt','other')),
    host          TEXT,
    port          INTEGER,
    unit_id       INTEGER,
    legacy_key    TEXT UNIQUE,
    is_active     BOOLEAN DEFAULT TRUE,
    meta          JSONB,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE 3: users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT 'CHANGE_ME',
    role          TEXT NOT NULL DEFAULT 'viewer'
                  CHECK (role IN ('admin','operator','viewer')),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    last_login    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_users_email_active ON users(email) WHERE is_active = TRUE;

-- ── TABLE 4: vibit_readings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vibit_readings (
    time          TIMESTAMPTZ    NOT NULL,
    sensor_id     UUID           NOT NULL REFERENCES machine_sensors(sensor_id),
    x_rms_acc     DOUBLE PRECISION,
    y_rms_acc     DOUBLE PRECISION,
    z_rms_acc     DOUBLE PRECISION,
    x_rms_vel     DOUBLE PRECISION,
    y_rms_vel     DOUBLE PRECISION,
    z_rms_vel     DOUBLE PRECISION,
    x_peak_acc    DOUBLE PRECISION,
    y_peak_acc    DOUBLE PRECISION,
    z_peak_acc    DOUBLE PRECISION,
    x_peak_vel    DOUBLE PRECISION,
    y_peak_vel    DOUBLE PRECISION,
    z_peak_vel    DOUBLE PRECISION,
    temperature   DOUBLE PRECISION,
    rpm           DOUBLE PRECISION,
    led_status    SMALLINT
);
CREATE INDEX IF NOT EXISTS ix_vibit_sensor_time ON vibit_readings(sensor_id, time DESC);

-- ── TABLE 5: opcua_readings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opcua_readings (
    time          TIMESTAMPTZ    NOT NULL,
    sensor_id     UUID           NOT NULL REFERENCES machine_sensors(sensor_id),
    tag_name      TEXT           NOT NULL,
    value_num     DOUBLE PRECISION,
    value_bool    BOOLEAN,
    value_text    TEXT,
    quality       SMALLINT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_opcua_sensor_tag_time ON opcua_readings(sensor_id, tag_name, time DESC);

-- ── TABLE 6: machine_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_events (
    time          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    machine_id    TEXT           NOT NULL REFERENCES machines(machine_id),
    sensor_id     UUID           REFERENCES machine_sensors(sensor_id),
    event_type    TEXT           NOT NULL
                  CHECK (event_type IN (
                      'connect','disconnect','alarm','warning',
                      'mode_change','cycle_start','cycle_end',
                      'error','maintenance','info'
                  )),
    severity      TEXT           CHECK (severity IN ('info','warning','critical')),
    title         TEXT           NOT NULL,
    payload       JSONB,
    resolved_at   TIMESTAMPTZ,
    operator_id   UUID           REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS ix_events_machine_time ON machine_events(machine_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_events_unresolved  ON machine_events(event_type, time DESC) WHERE resolved_at IS NULL;

-- ── TABLE 7: machine_connections ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_connections (
    id                BIGSERIAL     PRIMARY KEY,
    sensor_id         UUID          NOT NULL REFERENCES machine_sensors(sensor_id),
    connected_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    disconnected_at   TIMESTAMPTZ,
    disconnect_reason TEXT,
    simulated         BOOLEAN DEFAULT FALSE
);

-- ── TABLE 8: storage_boxes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_boxes (
    box_id       TEXT       PRIMARY KEY,
    column_name  CHAR(1)    NOT NULL,
    row_number   INTEGER    NOT NULL CHECK (row_number BETWEEN 1 AND 7),
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (column_name, row_number)
);

-- ── TABLE 9: storage_items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_items (
    item_id      SERIAL     PRIMARY KEY,
    sku          TEXT       UNIQUE,
    name         TEXT       NOT NULL,
    description  TEXT,
    unit         TEXT       DEFAULT 'pcs',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABLE 10: storage_compartments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_compartments (
    compartment_id  TEXT        PRIMARY KEY,
    box_id          TEXT        NOT NULL REFERENCES storage_boxes(box_id) ON DELETE CASCADE,
    sub_slot        CHAR(1)     NOT NULL,
    item_id         INTEGER     REFERENCES storage_items(item_id),
    quantity        INTEGER     DEFAULT 0 CHECK (quantity >= 0),
    status          TEXT        NOT NULL DEFAULT 'empty'
                    CHECK (status IN ('empty','occupied','reserved','error')),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (box_id, sub_slot)
);
CREATE TRIGGER compartments_updated_at
    BEFORE UPDATE ON storage_compartments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── TABLE 11: storage_transactions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage_transactions (
    tran_id         BIGSERIAL   PRIMARY KEY,
    time            TIMESTAMPTZ DEFAULT NOW(),
    compartment_id  TEXT        REFERENCES storage_compartments(compartment_id),
    item_id         INTEGER     REFERENCES storage_items(item_id),
    action          TEXT        NOT NULL
                    CHECK (action IN ('add','retrieve','transfer','adjust','audit')),
    quantity        INTEGER     NOT NULL DEFAULT 1,
    operator_id     UUID        REFERENCES users(user_id),
    request_id      UUID,
    asrs_command    TEXT,
    asrs_result     TEXT,
    notes           TEXT
);
CREATE INDEX IF NOT EXISTS ix_strans_item_time  ON storage_transactions(item_id, time DESC);
CREATE INDEX IF NOT EXISTS ix_strans_comp_time  ON storage_transactions(compartment_id, time DESC);

-- ── TABLE 12: shuttle_movements ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shuttle_movements (
    id            BIGSERIAL   PRIMARY KEY,
    time          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    command       TEXT        NOT NULL,
    from_row      INTEGER,
    from_col      TEXT,
    to_row        INTEGER,
    to_col        TEXT,
    state         TEXT        NOT NULL
                  CHECK (state IN ('idle','moving','busy','error','home')),
    duration_ms   INTEGER,
    result        TEXT,
    initiated_by  TEXT
);

-- ── TABLE 13: orders ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    order_id         SERIAL        PRIMARY KEY,
    customer_name    TEXT          NOT NULL,
    customer_email   TEXT          NOT NULL,
    customer_phone   TEXT          NOT NULL,
    shipping_address TEXT          NOT NULL,
    order_status     TEXT          NOT NULL DEFAULT 'pending'
                     CHECK (order_status IN (
                         'pending','processing','shipped','delivered','cancelled'
                     )),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE TRIGGER orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── TABLE 14: order_items ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id  SERIAL        PRIMARY KEY,
    order_id       INTEGER       NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    item_id        INTEGER       NOT NULL REFERENCES storage_items(item_id) ON DELETE RESTRICT,
    quantity       INTEGER       NOT NULL CHECK (quantity > 0),
    unit_price     NUMERIC(10,2) NOT NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_order_items_order ON order_items(order_id);
"""

COMPAT_VIEWS_SQL = """
-- Backward-compatible views so existing CRUD code keeps working unchanged
CREATE OR REPLACE VIEW "Boxes" AS
    SELECT box_id, column_name, row_number FROM storage_boxes;

CREATE OR REPLACE VIEW "Items" AS
    SELECT item_id, sku AS sku, name, description, created_at AS added_on FROM storage_items;

CREATE OR REPLACE VIEW "SubCompartments" AS
    SELECT
        compartment_id  AS subcom_place,
        box_id,
        sub_slot        AS sub_id,
        item_id,
        CASE status
            WHEN 'occupied' THEN 'Occupied'
            WHEN 'empty'    THEN 'Empty'
            ELSE initcap(status)
        END AS status
    FROM storage_compartments;

CREATE OR REPLACE VIEW "Transactions" AS
    SELECT
        tran_id,
        item_id,
        compartment_id  AS subcom_place,
        CASE action
            WHEN 'add'      THEN 'added'
            WHEN 'retrieve' THEN 'retrieved'
            ELSE action
        END AS action,
        time
    FROM storage_transactions;

CREATE OR REPLACE VIEW "Orders" AS
    SELECT order_id, customer_name, customer_email, customer_phone,
           shipping_address, order_status, created_at, updated_at FROM orders;

CREATE OR REPLACE VIEW "OrderItems" AS
    SELECT order_item_id, order_id, item_id, quantity, unit_price,
           (quantity * unit_price) AS total_price, created_at FROM order_items;

CREATE OR REPLACE VIEW shuttle_state AS
    SELECT
        1           AS id,
        to_row      AS row_num,
        to_col      AS column_letter,
        state,
        command,
        time        AS updated_at
    FROM shuttle_movements
    ORDER BY time DESC
    LIMIT 1;
"""

# ══════════════════════════════════════════════════════════════════════════════
#  4.  Seed data (real values from config)
# ══════════════════════════════════════════════════════════════════════════════
MACHINES_SEED = [
    ("mirac",     "MIRAC CNC Lathe",               "cnc_lathe",      "Bay 1", "MIRAC",          None),
    ("triac",     "TRIAC CNC Mill",                "cnc_mill",       "Bay 2", "TRIAC",          None),
    ("hydraulic", "Hydraulic Assembly Press",      "hydraulic_press","Bay 3", "OMRON (AX-308)", "AX-308EA0MA1P"),
    ("asrs",      "Automated Storage & Retrieval", "asrs",           "Bay 4", None,             None),
    ("amr",       "Autonomous Mobile Robot",       "amr",            "Floor", None,             None),
    ("cobot",     "TM Collaborative Robot",        "cobot",          "Bay 5", "Techman Robot",  None),
]

def build_sensors_seed(env: dict) -> list:
    """Build machine_sensors seed rows from real .env values."""
    return [
        # (machine_id, name, protocol, host, port, unit_id, legacy_key)
        # ── MIRAC CNC ──────────────────────────────────────────────────────────
        ("mirac", "MIRAC PLC (OPC-UA)",      "opcua",     env.get("MIRAC_OPCUA_URL","").split("//")[-1].split(":")[0], 4840, None, "mirac"),
        ("mirac", "Spindle VIBIT (U1)",       "modbus_tcp",env.get("VIBIT_HOST","10.10.14.103"), int(env.get("VIBIT_PORT",502)),  int(env.get("VIBIT_UNIT_ID",1)),   "mirac_vibit1"),
        ("mirac", "Tool VIBIT (U2)",          "modbus_tcp",env.get("VIBIT_HOST","10.10.14.103"), int(env.get("VIBIT_PORT",502)),  int(env.get("VIBIT_UNIT_ID_2",2)), "mirac_vibit2"),
        ("mirac", "Axes VIBIT (U3)",          "modbus_tcp",env.get("VIBIT_HOST","10.10.14.103"), int(env.get("VIBIT_PORT",502)),  int(env.get("VIBIT_UNIT_ID_3",3)), "mirac_vibit3"),
        # ── TRIAC CNC ──────────────────────────────────────────────────────────
        ("triac", "TRIAC PLC (OPC-UA)",      "opcua",     env.get("TRIAC_OPCUA_URL","").split("//")[-1].split(":")[0], 4840, None, "triac"),
        ("triac", "Spindle VIBIT (U1)",       "modbus_tcp",env.get("TRIAC_VIBIT_HOST","10.10.14.129"), int(env.get("TRIAC_VIBIT_PORT",502)), int(env.get("TRIAC_VIBIT_UNIT_ID",1)),   "triac_vibit1"),
        ("triac", "Tool VIBIT (U2)",          "modbus_tcp",env.get("TRIAC_VIBIT_HOST","10.10.14.129"), int(env.get("TRIAC_VIBIT_PORT",502)), int(env.get("TRIAC_VIBIT_UNIT_ID_2",2)), "triac_vibit2"),
        # ── Hydraulic ──────────────────────────────────────────────────────────
        ("hydraulic","Hydraulic PLC (OPC-UA)","opcua",    env.get("HYDRAULIC_OPCUA_URL","").split("//")[-1].split(":")[0], 4840, None, "hydraulic"),
        # ── ASRS ───────────────────────────────────────────────────────────────
        ("asrs",  "ASRS PLC (OPC-UA)",        "opcua",     env.get("ASRS_OPCUA_URL","").split("//")[-1].split(":")[0], 4840, int(env.get("ASRS_OPCUA_NS",4)), "asrs"),
        # ── AMR ────────────────────────────────────────────────────────────────
        ("amr",   "AMR Modbus Controller",    "modbus_tcp",env.get("AMR_HOST","10.10.14.122"), int(env.get("AMR_PORT",502)), int(env.get("AMR_UNIT_ID",1)), "amr"),
        # ── Cobot ──────────────────────────────────────────────────────────────
        ("cobot", "TM Cobot TMSCT Interface", "tcp_raw",   env.get("COBOT_HOST","10.10.14.106"), int(env.get("COBOT_PORT",5890)), None, "cobot"),
    ]


# ══════════════════════════════════════════════════════════════════════════════
#  5.  Main setup routine
# ══════════════════════════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(description="CoEDM Platform DB Setup")
    parser.add_argument("--update-env",    action="store_true", help="Rewrite DATABASE_URL in backend/.env")
    parser.add_argument("--skip-migrate",  action="store_true", help="Skip migrating data from old DB")
    parser.add_argument("--dry-run",       action="store_true", help="Print SQL without executing")
    parser.add_argument("--drop-first",    action="store_true", help="Drop coedm_platform if exists, then recreate")
    args = parser.parse_args()
    dry = args.dry_run

    print(f"\n{BOLD}{'═'*70}{RESET}")
    print(f"{BOLD}  CoEDM Platform — Database Setup & Migration{RESET}")
    print(f"{BOLD}{'═'*70}{RESET}")

    # ── Read config ──────────────────────────────────────────────────────────
    head("Step 0 — Reading configuration")
    env = parse_env()
    old_url = env.get("DATABASE_URL", "")
    if not old_url:
        err("DATABASE_URL not found in backend/.env")
        sys.exit(1)

    conn_params = parse_db_url(old_url)
    old_db = conn_params["dbname"]
    info(f"Old DB : {old_db}  ({conn_params['host']}:{conn_params['port']})")
    info(f"New DB : {NEW_DB}")
    if dry:
        warn("DRY-RUN mode — no SQL will be executed")

    # ── Phase 1: Create database ─────────────────────────────────────────────
    head("Step 1 — Creating database")
    admin_params = dict(conn_params)
    admin_params["dbname"] = "postgres"

    if not dry:
        try:
            admin_conn = connect(admin_params)
            admin_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
            cur = admin_conn.cursor()

            if args.drop_first:
                warn(f"Dropping existing {NEW_DB}...")
                cur.execute(f'DROP DATABASE IF EXISTS "{NEW_DB}"')
                ok(f"Dropped {NEW_DB}")

            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (NEW_DB,))
            if cur.fetchone():
                warn(f"Database '{NEW_DB}' already exists — skipping CREATE")
            else:
                cur.execute(f'CREATE DATABASE "{NEW_DB}" ENCODING \'UTF8\'')
                ok(f"Created database '{NEW_DB}'")

            cur.close()
            admin_conn.close()
        except Exception as e:
            err(f"Failed to create database: {e}")
            sys.exit(1)
    else:
        info(f"[DRY-RUN] CREATE DATABASE {NEW_DB}")

    # ── Phase 2: Install extensions ──────────────────────────────────────────
    head("Step 2 — Installing PostgreSQL extensions")
    new_params = dict(conn_params)
    new_params["dbname"] = NEW_DB

    timescale_available = False
    if not dry:
        try:
            conn = connect(new_params)
            conn.autocommit = True
            cur = conn.cursor()

            # uuid-ossp (needed for gen_random_uuid fallback)
            cur.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")
            ok("uuid-ossp installed")

            # pgcrypto (optional but useful for password hashing)
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
                ok("pgcrypto installed")
            except Exception:
                warn("pgcrypto not available (optional — skipping)")

            # TimescaleDB
            try:
                cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")
                timescale_available = True
                ok("TimescaleDB installed ✓ (hypertables will be created)")
            except Exception as te:
                warn(f"TimescaleDB not available: {te}")
                warn("Hypertables will be skipped — standard tables work fine")
                warn("Install TimescaleDB later and run: SELECT create_hypertable('vibit_readings','time');")

            conn.autocommit = False
            conn.commit()
            cur.close()
        except Exception as e:
            err(f"Extension installation failed: {e}")
            sys.exit(1)
    else:
        info("[DRY-RUN] CREATE EXTENSION timescaledb, uuid-ossp, pgcrypto")
        timescale_available = True  # assume available in dry-run

    # ── Phase 3: Create schema ───────────────────────────────────────────────
    head("Step 3 — Creating schema from init_db4.sql")
    if not dry:
        try:
            conn = connect(new_params)
            cur = conn.cursor()
            with open("backend/init_db4.sql", "r", encoding="utf-8") as f:
                schema_sql = f.read()
            cur.execute(schema_sql)
            conn.commit()
            ok("All base tables and seed data created from init_db4.sql")
        except Exception as e:
            conn.rollback()
            err(f"Schema creation failed: {e}")
            sys.exit(1)
    else:
        info("[DRY-RUN] Applying init_db4.sql")



    # ── Phase 8: Migrate old data ─────────────────────────────────────────────
    if args.skip_migrate:
        head("Step 8 — Migration SKIPPED (--skip-migrate)")
    else:
        head("Step 8 — Migrating data from inventory_management")
        try:
            old_conn = connect(conn_params)
            new_conn = connect(new_params)
            migrate_data(old_conn, new_conn, dry)
            old_conn.close()
            new_conn.close()
        except Exception as e:
            warn(f"Migration failed or old DB unavailable: {e}")
            warn("Continuing with empty ASRS tables — data can be migrated manually later")

    # ── Phase 9: Verify ───────────────────────────────────────────────────────
    head("Step 9 — Verification")
    tables_to_check = [
        "machines", "machine_sensors", "vibit_readings", "opcua_readings",
        "machine_events", "storage_boxes", "storage_items", "storage_compartments",
        "storage_transactions", "shuttle_movements", "orders", "order_items", "users",
    ]
    if not dry:
        try:
            conn = connect(new_params)
            cur = conn.cursor()
            for table in tables_to_check:
                try:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cur.fetchone()[0]
                    ok(f"{table:<30} {count:>6} rows")
                except Exception as te:
                    err(f"{table:<30} ← ERROR: {te}")
                    conn.rollback()
            cur.close()
            conn.close()
        except Exception as e:
            err(f"Verification failed: {e}")

        # Check timescaledb
        try:
            conn = connect(new_params)
            cur = conn.cursor()
            cur.execute("SELECT extversion FROM pg_extension WHERE extname='timescaledb'")
            row = cur.fetchone()
            if row:
                ok(f"TimescaleDB {row[0]} active")
            else:
                warn("TimescaleDB not enabled")
            cur.close()
            conn.close()
        except Exception:
            warn("Could not verify TimescaleDB")
    else:
        info("[DRY-RUN] Would verify all table row counts")

    # ── Phase 10: Update .env ─────────────────────────────────────────────────
    head("Step 10 — Update backend/.env")
    new_url = old_url.replace(old_db, NEW_DB)
    if args.update_env:
        if not dry:
            content = ENV_FILE.read_text(encoding="utf-8")
            new_content = re.sub(
                r"^DATABASE_URL\s*=.*$",
                f"DATABASE_URL={new_url}",
                content,
                flags=re.MULTILINE
            )
            ENV_FILE.write_text(new_content, encoding="utf-8")
            ok(f"DATABASE_URL updated in backend/.env")
            ok(f"  → {new_url}")
        else:
            info(f"[DRY-RUN] Would set DATABASE_URL={new_url}")
    else:
        warn("DATABASE_URL not updated (run with --update-env to do this automatically)")
        info(f"Manual update needed in backend/.env:")
        print(f"\n    DATABASE_URL={new_url}\n")

    # ── Done ──────────────────────────────────────────────────────────────────
    print(f"\n{BOLD}{'═'*70}{RESET}")
    print(f"{GREEN}{BOLD}  ✓  Setup complete!  {RESET}")
    print(f"{BOLD}{'═'*70}{RESET}")
    print(f"""
  Next steps:
    1.  {'Already done!' if args.update_env else f'Update backend/.env: DATABASE_URL={new_url}'}
    2.  Restart the backend:  python start.py
    3.  Verify:  GET http://localhost:8000/api/health
""")


# ══════════════════════════════════════════════════════════════════════════════
#  6.  Data migration routine
# ══════════════════════════════════════════════════════════════════════════════
def migrate_data(old_conn, new_conn, dry: bool):
    """Copy all rows from inventory_management into coedm_platform."""
    old_cur = old_conn.cursor()
    new_cur = new_conn.cursor()



    # ── storage_items ← "Items" ───────────────────────────────────────────────
    info("Migrating Items → storage_items...")
    try:
        old_cur.execute('SELECT item_id, name, description, added_on FROM "Items"')
        rows = old_cur.fetchall()
        if rows and not dry:
            for item_id, name, description, added_on in rows:
                new_cur.execute("""
                    INSERT INTO storage_items (item_id, name, description, item_type, created_at)
                    VALUES (%s, %s, %s, 'raw', %s) ON CONFLICT (item_id) DO NOTHING
                """, (item_id, name, description, added_on))
            # Reset sequence to avoid PK conflicts
            new_cur.execute("""
                SELECT setval(
                    pg_get_serial_sequence('storage_items','item_id'),
                    COALESCE(MAX(item_id), 1)
                ) FROM storage_items
            """)
            new_conn.commit()
        ok(f"storage_items ← {len(rows)} rows")
    except Exception as e:
        new_conn.rollback()
        warn(f"storage_items migration skipped: {e}")

    # ── storage_compartments ← "SubCompartments" ─────────────────────────────
    info("Migrating SubCompartments → storage_compartments...")
    try:
        old_cur.execute("""
            SELECT subcom_place, box_id, sub_id, item_id, status
            FROM "SubCompartments"
        """)
        rows = old_cur.fetchall()
        if rows and not dry:
            for subcom_place, box_id, sub_id, item_id, status in rows:
                new_status = "occupied" if status == "Occupied" else "empty"
                new_cur.execute("""
                    INSERT INTO storage_compartments
                        (compartment_id, box_id, sub_slot, item_id, quantity, status)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (compartment_id) DO UPDATE 
                    SET item_id = EXCLUDED.item_id, 
                        quantity = EXCLUDED.quantity, 
                        status = EXCLUDED.status
                """, (
                    subcom_place, box_id,
                    str(sub_id) if sub_id else None,
                    item_id,
                    1 if item_id else 0,
                    new_status,
                ))
            new_conn.commit()
        ok(f"storage_compartments ← {len(rows)} rows")
    except Exception as e:
        new_conn.rollback()
        warn(f"storage_compartments migration skipped: {e}")

    # ── storage_transactions ← "Transactions" ─────────────────────────────────
    info("Migrating Transactions → storage_transactions...")
    try:
        old_cur.execute("""
            SELECT tran_id, item_id, subcom_place, action, time
            FROM "Transactions" ORDER BY tran_id
        """)
        rows = old_cur.fetchall()
        if rows and not dry:
            action_map = {"added": "add", "retrieved": "retrieve"}
            for tran_id, item_id, subcom_place, action, time_ in rows:
                new_action = action_map.get(action, "add")
                new_cur.execute("""
                    INSERT INTO storage_transactions
                        (tran_id, item_id, compartment_id, action, time, notes)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (tran_id) DO NOTHING
                """, (tran_id, item_id, subcom_place, new_action, time_, f"migrated from {action}"))
            new_cur.execute("""
                SELECT setval(
                    pg_get_serial_sequence('storage_transactions','tran_id'),
                    COALESCE(MAX(tran_id), 1)
                ) FROM storage_transactions
            """)
            new_conn.commit()
        ok(f"storage_transactions ← {len(rows)} rows")
    except Exception as e:
        new_conn.rollback()
        warn(f"storage_transactions migration skipped: {e}")

    # ── orders ← "Orders" ─────────────────────────────────────────────────────
    info("Migrating Orders → orders...")
    try:
        old_cur.execute("""
            SELECT order_id, customer_name, customer_email, customer_phone,
                   shipping_address, total_amount, order_status, created_at, updated_at
            FROM "Orders" ORDER BY order_id
        """)
        rows = old_cur.fetchall()
        if rows and not dry:
            for row in rows:
                order_id, cname, email, phone, addr, _total, status, created, updated = row
                new_cur.execute("""
                    INSERT INTO orders
                        (order_id, customer_name, customer_email, customer_phone,
                         shipping_address, order_status, created_at, updated_at)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (order_id) DO NOTHING
                """, (order_id, cname, email, phone, addr, status, created, updated))
            new_cur.execute("""
                SELECT setval(
                    pg_get_serial_sequence('orders','order_id'),
                    COALESCE(MAX(order_id),1)
                ) FROM orders
            """)
            new_conn.commit()
        ok(f"orders ← {len(rows)} rows")
    except Exception as e:
        new_conn.rollback()
        warn(f"orders migration skipped: {e}")

    # ── order_items ← "OrderItems" ────────────────────────────────────────────
    info("Migrating OrderItems → order_items...")
    try:
        old_cur.execute("""
            SELECT order_item_id, order_id, item_id, quantity, unit_price, created_at
            FROM "OrderItems" ORDER BY order_item_id
        """)
        rows = old_cur.fetchall()
        if rows and not dry:
            for row in rows:
                oi_id, oid, iid, qty, price, created = row
                new_cur.execute("""
                    INSERT INTO order_items
                        (order_item_id, order_id, item_id, quantity, unit_price, created_at)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (order_item_id) DO NOTHING
                """, (oi_id, oid, iid, qty, price, created))
            new_cur.execute("""
                SELECT setval(
                    pg_get_serial_sequence('order_items','order_item_id'),
                    COALESCE(MAX(order_item_id),1)
                ) FROM order_items
            """)
            new_conn.commit()
        ok(f"order_items ← {len(rows)} rows")
    except Exception as e:
        new_conn.rollback()
        warn(f"order_items migration skipped: {e}")

    # ── shuttle_movements ← shuttle_state ─────────────────────────────────────
    info("Migrating shuttle_state → shuttle_movements...")
    try:
        old_cur.execute("SELECT row_num, column_letter, state, command FROM shuttle_state LIMIT 1")
        row = old_cur.fetchone()
        if row and not dry:
            row_num, col_letter, state, command = row
            new_state = state if state in ("idle","moving","busy","error","home") else "idle"
            new_cur.execute("""
                INSERT INTO shuttle_movements (command, to_row, to_col, state, initiated_by, result)
                VALUES (%s, %s, %s, %s, 'migrated', 'migrated from shuttle_state')
            """, (command or "HOME", row_num or 0, col_letter or "A", new_state))
            new_conn.commit()
        ok("shuttle_movements ← 1 row (last known state)")
    except Exception as e:
        new_conn.rollback()
        warn(f"shuttle_movements migration skipped: {e}")

    old_cur.close()
    new_cur.close()


if __name__ == "__main__":
    main()
