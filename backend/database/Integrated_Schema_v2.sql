-- ============================================================
-- CoEDM Lab MES Database — Integrated Schema  v2
-- Pure PostgreSQL (no TimescaleDB dependency)
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE throughout.
-- update_updated_at() is assumed to already exist in the DB;
-- all other functions are (re)created with OR REPLACE.
--
-- Changes vs v1:
--   • Removed TimescaleDB extension, create_hypertable,
--     continuous aggregates, compression/retention policies
--   • Standard PostgreSQL partial indexes replace hypertable chunks
--   • Materialized views replace continuous aggregates
--     (refresh manually or via pg_cron)
--   • All CREATE TABLE now guarded with IF NOT EXISTS
--   • update_updated_at() wrapped in DO block — skipped if owned
--     by another role; all other functions use CREATE OR REPLACE
--   • mirac_sensor_data: corrected types (was MIRAC_SENSOR_DATA draft)
--   • vibit_readings: illegal FK on modbus_unit_id removed
-- ============================================================


-- ============================================================
-- 0a. SHARED UTILITY FUNCTION
--     update_updated_at() already exists in this DB (owned by
--     another role).  We skip re-creation with a DO guard so the
--     script stays idempotent.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  p.proname = 'update_updated_at'
          AND  n.nspname = 'public'
    ) THEN
        EXECUTE $f$
            CREATE FUNCTION update_updated_at()
            RETURNS TRIGGER LANGUAGE plpgsql AS $body$
            BEGIN
                NEW.updated_at := NOW();
                RETURN NEW;
            END;
            $body$;
        $f$;
    END IF;
END
$$;

COMMENT ON FUNCTION update_updated_at() IS
    'Generic BEFORE UPDATE trigger: stamps updated_at = NOW().';


-- ============================================================
-- 1. MACHINES
-- ============================================================
CREATE TABLE IF NOT EXISTS machines (
    machine_id      TEXT         PRIMARY KEY,
    display_name    TEXT         NOT NULL,
    machine_type    TEXT         NOT NULL
                        CHECK (machine_type IN (
                            'cnc_lathe','cnc_mill','hydraulic_press',
                            'asrs','amr','cobot','testing','other'
                        )),
    location        TEXT         NOT NULL DEFAULT 'CoEDM Lab',
    protocol        TEXT         NOT NULL
                        CHECK (protocol IN ('opcua','modbus_tcp','tcp_raw','mqtt','other')),
    host            TEXT         NOT NULL DEFAULT '',
    port            INTEGER      NOT NULL DEFAULT 0
                        CHECK (port BETWEEN 0 AND 65535),
    is_active       BOOLEAN      NOT NULL DEFAULT FALSE,
    meta            JSONB        NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machines_active ON machines (is_active);
CREATE INDEX IF NOT EXISTS idx_machines_type   ON machines (machine_type);

COMMENT ON TABLE  machines            IS 'ROOT TABLE. Every table traces back here via machine_id FK.';
COMMENT ON COLUMN machines.machine_id IS 'Semantic text PK. Use descriptive IDs: "asrs", "mirac", "cobot".';
COMMENT ON COLUMN machines.meta       IS 'Arbitrary config JSONB e.g. {"rack":"A","zone":"storage"}.';

INSERT INTO machines (machine_id, display_name, machine_type, location, protocol, host, port, is_active)
VALUES
    ('asrs',     'Automated Storage & Retrieval', 'asrs',           'CoEDM Lab Bay 1', 'opcua',     '10.10.14.104', 4840, TRUE ),
    ('mirac',    'MIRAC CNC Lathe',               'cnc_lathe',      'CoEDM Lab Bay 2', 'opcua',     '10.10.14.102', 4840, TRUE ),
    ('triac',    'TRIAC CNC Mill',                'cnc_mill',       'CoEDM Lab Bay 3', 'opcua',     '10.10.14.124', 4840, TRUE ),
    ('assembly', 'Assembly Station',              'hydraulic_press','CoEDM Lab Bay 4', 'opcua',     '10.10.14.113', 4840, TRUE ),
    ('amr',      'Autonomous Mobile Robot',       'amr',            'CoEDM Lab',       'modbus_tcp','',             0,    FALSE),
    ('cobot',    'TM Collaborative Robot',        'cobot',          'AMR',             'tcp_raw',   '10.10.14.106', 5890, FALSE),
    ('testing',  'Testing Station',               'testing',        'Bay 6',           'opcua',     '',             0,    FALSE)
ON CONFLICT (machine_id) DO NOTHING;


-- ============================================================
-- 2. MACHINE_SENSORS  → machines
-- ============================================================
CREATE TABLE IF NOT EXISTS machine_sensors (
    sensor_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id      TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    name            TEXT         NOT NULL,
    protocol        TEXT         NOT NULL
                        CHECK (protocol IN ('opcua','modbus_tcp','tcp_raw','mqtt','other')),
    host            TEXT         NOT NULL DEFAULT '',
    port            INTEGER      NOT NULL DEFAULT 0
                        CHECK (port BETWEEN 0 AND 65535),
    modbus_unit_id  SMALLINT,
    legacy_key      TEXT         UNIQUE,
    is_active       BOOLEAN      NOT NULL DEFAULT FALSE,
    meta            JSONB        NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_active_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (machine_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sensors_machine ON machine_sensors (machine_id);
CREATE INDEX IF NOT EXISTS idx_sensors_active  ON machine_sensors (is_active);

COMMENT ON TABLE  machine_sensors                IS 'Sensors/PLCs per machine. FK → machines.';
COMMENT ON COLUMN machine_sensors.legacy_key     IS 'Maps old integer sensor IDs during migration.';
COMMENT ON COLUMN machine_sensors.modbus_unit_id IS 'Modbus slave address. NULL for OPC-UA/TCP. NOT a unique key — never FK-reference this column.';

INSERT INTO machine_sensors (machine_id, name, protocol, host, port, modbus_unit_id, is_active, legacy_key)
VALUES
    ('asrs',     'ASRS PLC',                  'opcua',     '10.10.14.104', 4840, NULL, TRUE,  'asrs'),
    ('mirac',    'MIRAC PLC',                 'opcua',     '10.10.14.102', 4840, NULL, TRUE,  'mirac'),
    ('mirac',    'Spindle VIBIT (U1)',         'modbus_tcp','10.10.14.103',  502, 1,    TRUE,  'mirac_vibit1'),
    ('mirac',    'Tool VIBIT (U2)',            'modbus_tcp','10.10.14.103',  502, 2,    TRUE,  'mirac_vibit2'),
    ('mirac',    'MIRAC Energy Meter',         'modbus_tcp','10.10.14.103',  502, 3,    TRUE,  'mirac_energy'),
    ('triac',    'TRIAC PLC',                 'opcua',     '10.10.14.124', 4840, NULL, TRUE,  'triac'),
    ('triac',    'Spindle VIBIT (U1)',         'modbus_tcp','10.10.14.129',  502, 1,    TRUE,  'triac_vibit1'),
    ('triac',    'Tool VIBIT (U2)',            'modbus_tcp','10.10.14.129',  502, 2,    TRUE,  'triac_vibit2'),
    ('triac',    'TRIAC Energy Meter',         'modbus_tcp','10.10.14.129',  502, 3,    TRUE,  'triac_energy'),
    ('assembly', 'Assembly Station PLC',      'opcua',     '10.10.14.113', 4840, NULL, TRUE,  'assembly'),
    ('amr',      'AMR Modbus Controller',     'modbus_tcp','10.10.14.122',  502, 1,    FALSE, 'amr'),
    ('cobot',    'TM Cobot TMSCT Interface',  'tcp_raw',   '10.10.14.106', 5890, NULL, FALSE, 'cobot')
ON CONFLICT (machine_id, name) DO NOTHING;


-- ============================================================
-- 3. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    user_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT         UNIQUE NOT NULL,
    email         TEXT         UNIQUE NOT NULL,
    full_name     TEXT,
    password_hash TEXT         NOT NULL DEFAULT 'CHANGE_ME',
    role          TEXT         NOT NULL DEFAULT 'viewer'
                      CHECK (role IN ('admin','operator','supervisor','viewer')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_active ON users (email) WHERE is_active = TRUE;

COMMENT ON TABLE  users               IS 'System users. Roles: admin > supervisor > operator > viewer.';
COMMENT ON COLUMN users.password_hash IS 'Store bcrypt hash. Never plain text.';


-- ============================================================
-- 4. STORAGE_ITEMS  → machines (asrs)
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_items (
    item_id     SERIAL       PRIMARY KEY,
    machine_id  TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT
                                 DEFAULT 'asrs',
    sku         TEXT         UNIQUE,
    name        TEXT         NOT NULL,
    description TEXT,
    item_type   TEXT         NOT NULL CHECK (item_type IN ('raw','finished','tool','consumable')),
    unit        TEXT         NOT NULL DEFAULT 'pcs',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_machine ON storage_items (machine_id);
CREATE INDEX IF NOT EXISTS idx_items_type    ON storage_items (item_type);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'items_updated_at'
    ) THEN
        CREATE TRIGGER items_updated_at
        BEFORE UPDATE ON storage_items
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

COMMENT ON TABLE  storage_items            IS 'Item master catalog. Anchored to the ASRS machine.';
COMMENT ON COLUMN storage_items.item_type  IS 'raw | finished | tool | consumable.';
COMMENT ON COLUMN storage_items.unit       IS 'Unit of measure: pcs, kg, m, etc.';


-- ============================================================
-- 5. STORAGE_BOXES  → machines (asrs)
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_boxes (
    box_id      TEXT         PRIMARY KEY,
    machine_id  TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT
                                 DEFAULT 'asrs',
    row_label   CHAR(1)      NOT NULL CHECK (row_label  BETWEEN 'A' AND 'E'),
    col_number  SMALLINT     NOT NULL CHECK (col_number BETWEEN 1   AND 7  ),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (machine_id, row_label, col_number)
);

CREATE INDEX IF NOT EXISTS idx_boxes_machine ON storage_boxes (machine_id);
CREATE INDEX IF NOT EXISTS idx_boxes_row     ON storage_boxes (row_label);

CREATE OR REPLACE FUNCTION compute_box_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.box_id := NEW.row_label || NEW.col_number::TEXT;
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_box_address'
    ) THEN
        CREATE TRIGGER trg_box_address
        BEFORE INSERT OR UPDATE ON storage_boxes
        FOR EACH ROW EXECUTE FUNCTION compute_box_address();
    END IF;
END $$;

COMMENT ON TABLE  storage_boxes            IS '35 crates in a 5×7 grid. box_id = row||col e.g. "A3".';
COMMENT ON COLUMN storage_boxes.machine_id IS 'FK → machines. Always "asrs".';

INSERT INTO storage_boxes (machine_id, row_label, col_number)
SELECT 'asrs', r::CHAR(1), c
FROM   unnest(ARRAY['A','B','C','D','E']) AS r
CROSS  JOIN generate_series(1, 7) AS c
ORDER  BY r, c
ON CONFLICT (machine_id, row_label, col_number) DO NOTHING;


-- ============================================================
-- 6. STORAGE_COMPARTMENTS  → storage_boxes, storage_items, machines
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_compartments (
    compartment_id  TEXT         PRIMARY KEY,
    machine_id      TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT
                                     DEFAULT 'asrs',
    box_id          TEXT         NOT NULL REFERENCES storage_boxes(box_id) ON DELETE CASCADE,
    sub_slot        CHAR(1)      NOT NULL CHECK (sub_slot BETWEEN 'a' AND 'f'),
    item_id         INTEGER      REFERENCES storage_items(item_id),
    quantity        INTEGER      NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    status          TEXT         NOT NULL DEFAULT 'empty'
                        CHECK (status IN ('empty','occupied','reserved','error')),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (box_id, sub_slot)
);

CREATE INDEX IF NOT EXISTS idx_comp_machine ON storage_compartments (machine_id);
CREATE INDEX IF NOT EXISTS idx_comp_status  ON storage_compartments (status);
CREATE INDEX IF NOT EXISTS idx_comp_item    ON storage_compartments (item_id) WHERE item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_compartment_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.compartment_id := NEW.box_id || NEW.sub_slot;
    NEW.updated_at     := NOW();
    SELECT machine_id INTO NEW.machine_id
    FROM   storage_boxes WHERE box_id = NEW.box_id;
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_compartment_sync'
    ) THEN
        CREATE TRIGGER trg_compartment_sync
        BEFORE INSERT OR UPDATE ON storage_compartments
        FOR EACH ROW EXECUTE FUNCTION sync_compartment_status();
    END IF;
END $$;

COMMENT ON TABLE  storage_compartments            IS '210 subcompartments (6 per box × 35 boxes). compartment_id e.g. "A1a".';
COMMENT ON COLUMN storage_compartments.machine_id IS 'FK → machines. Inherited from storage_boxes via trigger.';
COMMENT ON COLUMN storage_compartments.status     IS 'empty | occupied | reserved | error.';

INSERT INTO storage_compartments (box_id, sub_slot)
SELECT b.box_id, s
FROM   storage_boxes b
CROSS  JOIN unnest(ARRAY['a','b','c','d','e','f']) AS s
ORDER  BY b.box_id, s
ON CONFLICT (box_id, sub_slot) DO NOTHING;


-- ============================================================
-- 7. RETRIEVAL_QUEUE  → storage_items, users, machines
-- ============================================================
CREATE TABLE IF NOT EXISTS retrieval_queue (
    queue_id     SERIAL       PRIMARY KEY,
    machine_id   TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT
                                  DEFAULT 'asrs',
    item_id      INTEGER      NOT NULL REFERENCES storage_items(item_id),
    requested_by UUID         REFERENCES users(user_id),
    enqueue_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status       TEXT         NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','completed','cancelled')),
    priority     SMALLINT     NOT NULL DEFAULT 5
                     CHECK (priority BETWEEN 1 AND 10),
    notes        TEXT,
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_queue_machine ON retrieval_queue (machine_id);
CREATE INDEX IF NOT EXISTS idx_queue_pending ON retrieval_queue (priority ASC, enqueue_at ASC)
    WHERE status = 'pending';

COMMENT ON TABLE  retrieval_queue          IS 'FIFO job queue for ASRS retrievals.';
COMMENT ON COLUMN retrieval_queue.priority IS '1 = highest, 10 = lowest.';


-- ============================================================
-- 8. STORAGE_TRANSACTIONS  → compartments, items, users, queue, machines
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_transactions (
    tran_id        BIGSERIAL    PRIMARY KEY,
    machine_id     TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT
                                    DEFAULT 'asrs',
    time           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    compartment_id TEXT         REFERENCES storage_compartments(compartment_id),
    item_id        INTEGER      REFERENCES storage_items(item_id),
    action         TEXT         NOT NULL
                       CHECK (action IN ('add','retrieve','transfer','adjust','audit')),
    quantity       INTEGER      NOT NULL DEFAULT 1,
    operator_id    UUID         REFERENCES users(user_id),
    queue_id       INTEGER      REFERENCES retrieval_queue(queue_id),
    request_id     UUID,
    asrs_command   TEXT,
    asrs_result    TEXT,
    notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_strans_machine   ON storage_transactions (machine_id);
CREATE INDEX IF NOT EXISTS idx_strans_item_time ON storage_transactions (item_id,        time DESC);
CREATE INDEX IF NOT EXISTS idx_strans_comp_time ON storage_transactions (compartment_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_strans_time      ON storage_transactions (time DESC);

COMMENT ON TABLE storage_transactions IS 'Append-only ASRS operation log. Never UPDATE or DELETE rows.';


-- ============================================================
-- 9. SHUTTLE_MOVEMENTS  → machines (asrs)
-- ============================================================
CREATE TABLE IF NOT EXISTS shuttle_movements (
    id           BIGSERIAL    PRIMARY KEY,
    machine_id   TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE
                                  DEFAULT 'asrs',
    time         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    command      TEXT         NOT NULL,
    from_row     INTEGER,
    from_col     TEXT,
    to_row       INTEGER,
    to_col       TEXT,
    state        TEXT         NOT NULL
                     CHECK (state IN ('idle','moving','busy','error','home')),
    duration_ms  INTEGER,
    result       TEXT,
    initiated_by TEXT,
    raw_opcua    JSONB
);

CREATE INDEX IF NOT EXISTS idx_shuttle_machine_time ON shuttle_movements (machine_id, time DESC);

COMMENT ON TABLE shuttle_movements IS 'Full shuttle movement history. Latest row = current state. See VIEW v_shuttle_state.';

INSERT INTO shuttle_movements (machine_id, command, state, to_row, to_col, initiated_by)
VALUES ('asrs', 'HOME', 'idle', 7, 'A', 'system_init')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 10. ORDERS  → machines, users
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    order_id         SERIAL        PRIMARY KEY,
    machine_id       TEXT          NOT NULL REFERENCES machines(machine_id) ON DELETE RESTRICT
                                       DEFAULT 'asrs',
    operator_id      UUID          REFERENCES users(user_id),
    customer_name    TEXT          NOT NULL,
    customer_email   TEXT,
    customer_phone   TEXT,
    shipping_address TEXT,
    order_status     TEXT          NOT NULL DEFAULT 'pending'
                         CHECK (order_status IN ('pending','processing','shipped','delivered','cancelled')),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_machine ON orders (machine_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders (order_status);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'orders_updated_at'
    ) THEN
        CREATE TRIGGER orders_updated_at
        BEFORE UPDATE ON orders
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

COMMENT ON TABLE orders IS 'Customer orders fulfilled by the ASRS.';


-- ============================================================
-- 11. ORDER_ITEMS  → orders, storage_items
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id SERIAL         PRIMARY KEY,
    order_id      INTEGER        NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    item_id       INTEGER        NOT NULL REFERENCES storage_items(item_id),
    quantity      INTEGER        NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(10,2)  NOT NULL,
    total_price   NUMERIC(10,2)  GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oi_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_oi_item  ON order_items (item_id);

COMMENT ON COLUMN order_items.total_price IS 'Auto-computed: quantity × unit_price (GENERATED STORED).';


-- ============================================================
-- 12. MACHINE_EVENTS  → machines, machine_sensors, users
-- ============================================================
CREATE TABLE IF NOT EXISTS machine_events (
    time        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    machine_id  TEXT         NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    sensor_id   UUID         REFERENCES machine_sensors(sensor_id),
    event_type  TEXT         NOT NULL
                    CHECK (event_type IN (
                        'connect','disconnect','alarm','warning',
                        'mode_change','cycle_start','cycle_end',
                        'error','maintenance','info'
                    )),
    severity    TEXT         CHECK (severity IN ('info','warning','critical')),
    title       TEXT         NOT NULL,
    payload     JSONB,
    resolved_at TIMESTAMPTZ,
    operator_id UUID         REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_events_machine_time ON machine_events (machine_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_events_unresolved   ON machine_events (event_type, time DESC)
    WHERE resolved_at IS NULL;

COMMENT ON TABLE machine_events IS 'Alarm/warning/lifecycle events for all machines.';


-- ============================================================
-- 13. MACHINE_CONNECTIONS  → machine_sensors
-- ============================================================
CREATE TABLE IF NOT EXISTS machine_connections (
    id                BIGSERIAL    PRIMARY KEY,
    sensor_id         UUID         NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    connected_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    disconnected_at   TIMESTAMPTZ,
    disconnect_reason TEXT,
    simulated         BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_conn_sensor ON machine_connections (sensor_id, connected_at DESC);

COMMENT ON TABLE machine_connections IS 'Sensor connect/disconnect history.';


-- ============================================================
-- 14. MIRAC_SENSOR_DATA  → machines, machine_sensors
--
--  Adopted from user draft MIRAC_SENSOR_DATA with corrections:
--    • Table name lowercased (convention)
--    • ID        → BIGSERIAL         (was plain INT)
--    • machine_id → TEXT FK          (was INT — wrong type)
--    • sensor_id  → UUID FK          (was INT — wrong type)
--    • DATETIME   → TIMESTAMPTZ      (DATETIME is not valid in PostgreSQL)
--    • Added z_axis_value, z_axis_feed for 3-axis CNC completeness
--    • Removed bare FOREIGN KEY clauses that referenced wrong PKs
-- ============================================================
CREATE TABLE IF NOT EXISTS mirac_sensor_data (
    id                    BIGSERIAL        PRIMARY KEY,
    time                  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    machine_id            TEXT             NOT NULL REFERENCES machines(machine_id)       ON DELETE CASCADE,
    sensor_id             UUID             NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    -- Axis positions (mm)
    x_axis_value          DOUBLE PRECISION NOT NULL,
    y_axis_value          DOUBLE PRECISION NOT NULL,
    z_axis_value          DOUBLE PRECISION NOT NULL,
    -- Feed rates (mm/min)
    x_axis_feed           DOUBLE PRECISION NOT NULL,
    y_axis_feed           DOUBLE PRECISION NOT NULL,
    z_axis_feed           DOUBLE PRECISION NOT NULL,
    -- Spindle
    spindle_speed         DOUBLE PRECISION NOT NULL,
    spindle_temperature   DOUBLE PRECISION NOT NULL,
    spindle_vibration     DOUBLE PRECISION NOT NULL,
    -- Tool
    tool_number           SMALLINT         NOT NULL,
    tool_temperature      DOUBLE PRECISION NOT NULL,
    tool_vibration        DOUBLE PRECISION NOT NULL,
    -- Status indicators
    led_red               BOOLEAN          NOT NULL DEFAULT FALSE,
    led_yellow            BOOLEAN          NOT NULL DEFAULT FALSE,
    led_green             BOOLEAN          NOT NULL DEFAULT FALSE,
    safety_curtain_status BOOLEAN          NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_mirac_machine_time ON mirac_sensor_data (machine_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_mirac_sensor_time  ON mirac_sensor_data (sensor_id,  time DESC);
CREATE INDEX IF NOT EXISTS idx_mirac_tool         ON mirac_sensor_data (tool_number, time DESC);
-- Partial index removed because NOW() is not IMMUTABLE. Relies on idx_mirac_machine_time instead.

COMMENT ON TABLE  mirac_sensor_data IS 'MIRAC CNC Lathe real-time PLC + VIBIT sensor data.';
COMMENT ON COLUMN mirac_sensor_data.z_axis_value    IS 'Z-axis position (mm). Added for 3-axis completeness.';
COMMENT ON COLUMN mirac_sensor_data.spindle_vibration IS 'Overall scalar vibration. Detailed 3-axis data is in vibit_readings.';
COMMENT ON COLUMN mirac_sensor_data.tool_number       IS 'Active tool number from the tool changer.';


-- ============================================================
-- 15. VIBIT_READINGS  → machine_sensors
--
--  Fix from draft: removed REFERENCES machine_sensors(modbus_unit_id)
--  modbus_unit_id is NOT a unique/PK column in machine_sensors.
--  PostgreSQL only permits FK references to PRIMARY KEY or UNIQUE
--  columns. The sensor is already identified by sensor_id (UUID FK).
--  modbus_unit_id is retained as an informational copy.
-- ============================================================
CREATE TABLE IF NOT EXISTS vibit_readings (
    time            TIMESTAMPTZ      NOT NULL,
    machine_id      TEXT             NOT NULL REFERENCES machines(machine_id) ON DELETE CASCADE,
    sensor_id       UUID             NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    modbus_unit_id  SMALLINT         NOT NULL,  -- informational copy; no FK (not unique in machine_sensors)
    x_rms_acc       DOUBLE PRECISION,
    y_rms_acc       DOUBLE PRECISION,
    z_rms_acc       DOUBLE PRECISION,
    x_rms_vel       DOUBLE PRECISION,
    y_rms_vel       DOUBLE PRECISION,
    z_rms_vel       DOUBLE PRECISION,
    x_peak_acc      DOUBLE PRECISION,
    y_peak_acc      DOUBLE PRECISION,
    z_peak_acc      DOUBLE PRECISION,
    x_peak_vel      DOUBLE PRECISION,
    y_peak_vel      DOUBLE PRECISION,
    z_peak_vel      DOUBLE PRECISION,
    temperature     DOUBLE PRECISION,
    rpm             DOUBLE PRECISION,
    led_status      SMALLINT
);

CREATE INDEX IF NOT EXISTS idx_vibit_sensor_time ON vibit_readings (sensor_id, time DESC);
-- Partial index removed because NOW() is not IMMUTABLE. Relies on idx_vibit_sensor_time instead.

COMMENT ON TABLE  vibit_readings                IS 'Vibration time-series (VIBIT Modbus). Resolves to machines via machine_sensors.machine_id.';
COMMENT ON COLUMN vibit_readings.modbus_unit_id IS 'Informational copy of Modbus unit address. Not a FK — modbus_unit_id has no UNIQUE constraint in machine_sensors.';


-- ============================================================
-- 16. ENERGY_METER_DATA  → machines, machine_sensors
-- ============================================================
CREATE TABLE IF NOT EXISTS energy_meter_data (
    time                TIMESTAMPTZ      NOT NULL,
    machine_id          TEXT             NOT NULL REFERENCES machines(machine_id)       ON DELETE CASCADE,
    sensor_id           UUID             NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    average_voltage_ln  DOUBLE PRECISION NOT NULL,
    average_voltage_ll  DOUBLE PRECISION NOT NULL,
    average_current     DOUBLE PRECISION NOT NULL,
    total_net_kwh       DOUBLE PRECISION NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_energy_machine_time ON energy_meter_data (machine_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_energy_sensor_time  ON energy_meter_data (sensor_id,  time DESC);

COMMENT ON TABLE energy_meter_data IS 'Energy meter time-series. FK → machines + machine_sensors.';


-- ============================================================
-- 17. ASSEMBLY_STATION_DATA  → machines, machine_sensors
-- ============================================================
CREATE TABLE IF NOT EXISTS assembly_station_data (
    time                     TIMESTAMPTZ  NOT NULL,
    machine_id               TEXT         NOT NULL REFERENCES machines(machine_id)       ON DELETE CASCADE,
    sensor_id                UUID         NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    bearing_operation_status BOOLEAN      NOT NULL,
    shaft_operation_status   BOOLEAN      NOT NULL,
    vice_status              TEXT         NOT NULL DEFAULT 'unknown'
                                 CHECK (vice_status IN ('open','closed','unknown')),
    led_red                  BOOLEAN      NOT NULL,
    led_yellow               BOOLEAN      NOT NULL,
    led_green                BOOLEAN      NOT NULL,
    safety_curtain_status    BOOLEAN      NOT NULL,
    displacement_mm          DOUBLE PRECISION
);

CREATE INDEX IF NOT EXISTS idx_assembly_machine_time ON assembly_station_data (machine_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_assembly_sensor_time  ON assembly_station_data (sensor_id,  time DESC);

COMMENT ON TABLE assembly_station_data IS 'Assembly PLC status time-series. FK → machines + machine_sensors.';


-- ============================================================
-- 18. PLACEHOLDER TABLES FOR FUTURE DEVICES
-- ============================================================

-- 18a. TRIAC_SENSOR_DATA (future — TRIAC CNC Mill)
CREATE TABLE IF NOT EXISTS triac_sensor_data (
    id                    BIGSERIAL        PRIMARY KEY,
    time                  TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    machine_id            TEXT             NOT NULL REFERENCES machines(machine_id)       ON DELETE CASCADE,
    sensor_id             UUID             NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    x_axis_value          DOUBLE PRECISION,
    y_axis_value          DOUBLE PRECISION,
    z_axis_value          DOUBLE PRECISION,
    x_axis_feed           DOUBLE PRECISION,
    y_axis_feed           DOUBLE PRECISION,
    z_axis_feed           DOUBLE PRECISION,
    spindle_speed         DOUBLE PRECISION,
    spindle_temperature   DOUBLE PRECISION,
    spindle_vibration     DOUBLE PRECISION,
    tool_number           SMALLINT,
    tool_temperature      DOUBLE PRECISION,
    tool_vibration        DOUBLE PRECISION,
    led_red               BOOLEAN DEFAULT FALSE,
    led_yellow            BOOLEAN DEFAULT FALSE,
    led_green             BOOLEAN DEFAULT FALSE,
    safety_curtain_status BOOLEAN DEFAULT FALSE
);
COMMENT ON TABLE triac_sensor_data IS 'PLACEHOLDER: TRIAC CNC Mill sensor data. Mirrors mirac_sensor_data. Activate when pipeline is ready.';

-- 18b. AMR_SENSOR_DATA (future — Autonomous Mobile Robot)
CREATE TABLE IF NOT EXISTS amr_sensor_data (
    id                BIGSERIAL        PRIMARY KEY,
    time              TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    machine_id        TEXT             NOT NULL REFERENCES machines(machine_id)       ON DELETE CASCADE,
    sensor_id         UUID             NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    position_x        DOUBLE PRECISION,
    position_y        DOUBLE PRECISION,
    heading_deg       DOUBLE PRECISION,
    battery_pct       DOUBLE PRECISION,
    velocity          DOUBLE PRECISION,
    navigation_state  TEXT,
    obstacle_detected BOOLEAN DEFAULT FALSE
);
COMMENT ON TABLE amr_sensor_data IS 'PLACEHOLDER: AMR position/navigation data. Activate when Modbus pipeline is ready.';

-- 18c. COBOT_SENSOR_DATA (future — TM Collaborative Robot)
CREATE TABLE IF NOT EXISTS cobot_sensor_data (
    id             BIGSERIAL        PRIMARY KEY,
    time           TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    machine_id     TEXT             NOT NULL REFERENCES machines(machine_id)       ON DELETE CASCADE,
    sensor_id      UUID             NOT NULL REFERENCES machine_sensors(sensor_id) ON DELETE CASCADE,
    joint1_angle   DOUBLE PRECISION,
    joint2_angle   DOUBLE PRECISION,
    joint3_angle   DOUBLE PRECISION,
    joint4_angle   DOUBLE PRECISION,
    joint5_angle   DOUBLE PRECISION,
    joint6_angle   DOUBLE PRECISION,
    tcp_x          DOUBLE PRECISION,
    tcp_y          DOUBLE PRECISION,
    tcp_z          DOUBLE PRECISION,
    tcp_force      DOUBLE PRECISION,
    safety_status  TEXT
);
COMMENT ON TABLE cobot_sensor_data IS 'PLACEHOLDER: TM Cobot joint/TCP data. Activate when TMSCT TCP pipeline is ready.';


-- ============================================================
-- 19. OPERATIONAL VIEWS
-- ============================================================

-- 19a. v_machine_status — current status of all machines
CREATE OR REPLACE VIEW v_machine_status AS
SELECT
    m.machine_id,
    m.display_name,
    m.machine_type,
    m.location,
    m.protocol,
    m.is_active,
    m.last_active_at,
    COUNT(s.sensor_id)                                  AS sensor_count,
    COUNT(s.sensor_id) FILTER (WHERE s.is_active)       AS active_sensor_count,
    (
        SELECT e.title
        FROM   machine_events e
        WHERE  e.machine_id = m.machine_id
          AND  e.resolved_at IS NULL
        ORDER  BY e.time DESC
        LIMIT  1
    )                                                    AS latest_unresolved_event
FROM   machines m
LEFT   JOIN machine_sensors s ON s.machine_id = m.machine_id
GROUP  BY m.machine_id;

COMMENT ON VIEW v_machine_status IS 'Live machine overview: active flag, sensor counts, latest unresolved event title.';

-- 19b. v_shuttle_state — latest ASRS shuttle state
CREATE OR REPLACE VIEW v_shuttle_state AS
SELECT DISTINCT ON (machine_id)
    machine_id,
    time         AS last_updated,
    command      AS last_command,
    state        AS current_state,
    from_row,
    from_col,
    to_row,
    to_col,
    duration_ms,
    result,
    initiated_by
FROM   shuttle_movements
ORDER  BY machine_id, time DESC;

COMMENT ON VIEW v_shuttle_state IS 'Latest shuttle_movements row per machine = current shuttle state.';

-- 19c. v_asrs_inventory — compartments with item details
CREATE OR REPLACE VIEW v_asrs_inventory AS
SELECT
    c.compartment_id,
    c.box_id,
    c.sub_slot,
    c.status,
    c.quantity,
    i.item_id,
    i.sku,
    i.name        AS item_name,
    i.item_type,
    i.unit,
    c.updated_at
FROM   storage_compartments c
LEFT   JOIN storage_items i ON i.item_id = c.item_id
ORDER  BY c.compartment_id;

COMMENT ON VIEW v_asrs_inventory IS 'Full ASRS compartment map with item details. Filter on status for empty/occupied slots.';

-- 19d. v_active_sensors — all active sensors with machine context
CREATE OR REPLACE VIEW v_active_sensors AS
SELECT
    s.sensor_id,
    s.name            AS sensor_name,
    s.protocol,
    s.host,
    s.port,
    s.modbus_unit_id,
    s.legacy_key,
    m.machine_id,
    m.display_name    AS machine_name,
    m.machine_type,
    m.location
FROM   machine_sensors s
JOIN   machines m ON m.machine_id = s.machine_id
WHERE  s.is_active = TRUE;

COMMENT ON VIEW v_active_sensors IS 'All active sensors with parent machine context. Used by data-collection agents at startup.';

-- 19e. v_unresolved_events — open alarms/warnings ordered by severity
CREATE OR REPLACE VIEW v_unresolved_events AS
SELECT
    e.time,
    e.machine_id,
    m.display_name  AS machine_name,
    e.event_type,
    e.severity,
    e.title,
    e.payload,
    e.sensor_id
FROM   machine_events e
JOIN   machines m ON m.machine_id = e.machine_id
WHERE  e.resolved_at IS NULL
ORDER  BY
    CASE e.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
    e.time DESC;

COMMENT ON VIEW v_unresolved_events IS 'All unresolved events ordered by severity (critical first) then time.';


-- ============================================================
-- 20. MATERIALIZED VIEWS  (replaces TimescaleDB continuous aggregates)
--     Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY <name>;
--     Schedule via pg_cron or an external scheduler.
-- ============================================================

-- 20a. MIRAC 1-minute averages
CREATE MATERIALIZED VIEW IF NOT EXISTS mirac_1min_agg AS
SELECT
    date_trunc('minute', time)     AS bucket,
    machine_id,
    sensor_id,
    AVG(spindle_speed)             AS avg_spindle_speed,
    MAX(spindle_speed)             AS max_spindle_speed,
    AVG(spindle_temperature)       AS avg_spindle_temp,
    MAX(spindle_temperature)       AS max_spindle_temp,
    AVG(spindle_vibration)         AS avg_spindle_vibration,
    AVG(tool_temperature)          AS avg_tool_temp,
    MAX(tool_temperature)          AS max_tool_temp,
    AVG(tool_vibration)            AS avg_tool_vibration,
    COUNT(*)                       AS sample_count
FROM   mirac_sensor_data
GROUP  BY bucket, machine_id, sensor_id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mirac_1min_agg_pk
    ON mirac_1min_agg (bucket, machine_id, sensor_id);

COMMENT ON MATERIALIZED VIEW mirac_1min_agg IS
    'Per-minute MIRAC spindle/tool averages. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY mirac_1min_agg;';

-- 20b. VIBIT 1-minute averages
CREATE MATERIALIZED VIEW IF NOT EXISTS vibit_1min_agg AS
SELECT
    date_trunc('minute', time)     AS bucket,
    sensor_id,
    AVG(x_rms_acc)                 AS avg_x_rms_acc,
    AVG(y_rms_acc)                 AS avg_y_rms_acc,
    AVG(z_rms_acc)                 AS avg_z_rms_acc,
    AVG(x_rms_vel)                 AS avg_x_rms_vel,
    AVG(y_rms_vel)                 AS avg_y_rms_vel,
    AVG(z_rms_vel)                 AS avg_z_rms_vel,
    MAX(x_peak_acc)                AS max_x_peak_acc,
    MAX(y_peak_acc)                AS max_y_peak_acc,
    MAX(z_peak_acc)                AS max_z_peak_acc,
    AVG(temperature)               AS avg_temperature,
    AVG(rpm)                       AS avg_rpm,
    COUNT(*)                       AS sample_count
FROM   vibit_readings
GROUP  BY bucket, sensor_id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vibit_1min_agg_pk
    ON vibit_1min_agg (bucket, sensor_id);

COMMENT ON MATERIALIZED VIEW vibit_1min_agg IS
    'Per-minute VIBIT RMS/peak averages per sensor. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY vibit_1min_agg;';

-- 20c. Energy 1-hour aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS energy_1hr_agg AS
SELECT
    date_trunc('hour', time)       AS bucket,
    machine_id,
    sensor_id,
    AVG(average_voltage_ln)        AS avg_voltage_ln,
    AVG(average_voltage_ll)        AS avg_voltage_ll,
    AVG(average_current)           AS avg_current,
    MAX(total_net_kwh) - MIN(total_net_kwh) AS kwh_delta,
    COUNT(*)                       AS sample_count
FROM   energy_meter_data
GROUP  BY bucket, machine_id, sensor_id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_energy_1hr_agg_pk
    ON energy_1hr_agg (bucket, machine_id, sensor_id);

COMMENT ON MATERIALIZED VIEW energy_1hr_agg IS
    'Per-hour energy averages and kWh delta per machine. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY energy_1hr_agg;';

-- 20d. Machine events daily summary
CREATE MATERIALIZED VIEW IF NOT EXISTS events_daily_summary AS
SELECT
    date_trunc('day', time)        AS bucket,
    machine_id,
    severity,
    event_type,
    COUNT(*)                       AS event_count,
    COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved_count
FROM   machine_events
GROUP  BY bucket, machine_id, severity, event_type
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_daily_agg_pk
    ON events_daily_summary (bucket, machine_id, severity, event_type);

COMMENT ON MATERIALIZED VIEW events_daily_summary IS
    'Daily event counts per machine by severity/type. Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY events_daily_summary;';


-- ============================================================
-- END OF SCHEMA
-- ============================================================
--
-- To refresh all materialized views (run via pg_cron or manually):
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mirac_1min_agg;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY vibit_1min_agg;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY energy_1hr_agg;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY events_daily_summary;
--
-- When TimescaleDB becomes available, convert time-series tables
-- with: SELECT create_hypertable('<table>', 'time', if_not_exists => TRUE);
-- and replace materialized views with continuous aggregates.
-- ============================================================

-- ============================================================
-- MIGRATIONS — safe to re-run (idempotent)
-- ============================================================
ALTER TABLE assembly_station_data
    ADD COLUMN IF NOT EXISTS vice_status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (vice_status IN ('open','closed','unknown'));
