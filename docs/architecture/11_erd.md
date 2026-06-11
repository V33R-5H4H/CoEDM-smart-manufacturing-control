# SE Model 11: Entity-Relationship Diagram (ERD)
## CoEDM Smart Manufacturing Control System — Database Schema v2

### Overview
This ERD is derived directly from `backend/database/Integrated_Schema_v2.sql`. It documents all 20+ tables, their columns, primary/foreign keys, and the relationships between them. The schema is structured around a single root table (`machines`) from which all other tables derive their identity.

---

## Database Architecture Philosophy
The schema follows a strict **hub-and-spoke** pattern anchored on the `machines` table:
- Every significant table carries a `machine_id TEXT FK → machines(machine_id)` column.
- Telemetry tables additionally carry a `sensor_id UUID FK → machine_sensors(sensor_id)`.
- This means any data row anywhere in the database can always be traced back to the specific physical machine that produced it.

---

## ERD — Domain 1: Machine Registry (Core)

```mermaid
erDiagram
    machines {
        TEXT machine_id PK
        TEXT display_name
        TEXT machine_type
        TEXT location
        TEXT protocol
        TEXT host
        INT  port
        BOOL is_active
        JSONB meta
        TIMESTAMP created_at
        TIMESTAMP last_active_at
    }

    machine_sensors {
        UUID sensor_id PK
        TEXT machine_id FK
        TEXT name
        TEXT protocol
        TEXT host
        INT  port
        SMALLINT modbus_unit_id
        TEXT legacy_key
        BOOL is_active
        JSONB meta
        TIMESTAMP created_at
        TIMESTAMP last_active_at
    }

    machine_events {
        TIMESTAMP time
        TEXT machine_id FK
        UUID sensor_id FK
        TEXT event_type
        TEXT severity
        TEXT title
        JSONB payload
        TIMESTAMP resolved_at
        UUID operator_id FK
    }

    machine_connections {
        BIGSERIAL id PK
        UUID sensor_id FK
        TIMESTAMP connected_at
        TIMESTAMP disconnected_at
        TEXT disconnect_reason
        BOOL simulated
    }

    users {
        UUID user_id PK
        TEXT username
        TEXT email
        TEXT full_name
        TEXT password_hash
        TEXT role
        BOOL is_active
        TIMESTAMP created_at
        TIMESTAMP last_login
    }

    machines ||--o{ machine_sensors     : "has sensors"
    machines ||--o{ machine_events      : "logs events"
    machine_sensors ||--o{ machine_connections : "tracks sessions"
    machine_sensors ||--o{ machine_events      : "tagged on event"
    users ||--o{ machine_events         : "operator_id"
```

---

## ERD — Domain 2: ASRS Inventory & Fulfillment

```mermaid
erDiagram
    machines {
        TEXT machine_id PK
    }

    users {
        UUID user_id PK
    }

    storage_items {
        SERIAL item_id PK
        TEXT machine_id FK
        TEXT sku
        TEXT name
        TEXT description
        TEXT item_type
        TEXT unit
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    storage_boxes {
        TEXT box_id PK
        TEXT machine_id FK
        CHAR row_label
        SMALLINT col_number
        TIMESTAMP created_at
    }

    storage_compartments {
        TEXT compartment_id PK
        TEXT machine_id FK
        TEXT box_id FK
        CHAR sub_slot
        INT item_id FK
        INT quantity
        TEXT status
        TIMESTAMP updated_at
    }

    retrieval_queue {
        SERIAL queue_id PK
        TEXT machine_id FK
        INT item_id FK
        UUID requested_by FK
        TIMESTAMP enqueue_at
        TEXT status
        SMALLINT priority
        TEXT notes
        TIMESTAMP processed_at
    }

    storage_transactions {
        BIGSERIAL tran_id PK
        TEXT machine_id FK
        TIMESTAMP time
        TEXT compartment_id FK
        INT item_id FK
        TEXT action
        INT quantity
        UUID operator_id FK
        INT queue_id FK
        UUID request_id
        TEXT asrs_command
        TEXT asrs_result
        TEXT notes
    }

    shuttle_movements {
        BIGSERIAL id PK
        TEXT machine_id FK
        TIMESTAMP time
        TEXT command
        INT from_row
        TEXT from_col
        INT to_row
        TEXT to_col
        TEXT state
        INT duration_ms
        TEXT result
        TEXT initiated_by
        JSONB raw_opcua
    }

    orders {
        SERIAL order_id PK
        TEXT machine_id FK
        UUID operator_id FK
        TEXT customer_name
        TEXT customer_email
        TEXT shipping_address
        TEXT order_status
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    order_items {
        SERIAL order_item_id PK
        INT order_id FK
        INT item_id FK
        INT quantity
        NUMERIC unit_price
        NUMERIC total_price
        TIMESTAMP created_at
    }

    machines ||--o{ storage_items         : "anchors items"
    machines ||--o{ storage_boxes         : "has 35 boxes"
    machines ||--o{ storage_compartments  : "inherits via trigger"
    machines ||--o{ retrieval_queue       : "processes jobs"
    machines ||--o{ storage_transactions  : "logs ops"
    machines ||--o{ shuttle_movements     : "records moves"
    machines ||--o{ orders               : "fulfills"

    storage_boxes ||--o{ storage_compartments : "has 6 sub-slots"
    storage_items |o--o{ storage_compartments : "occupies slot"
    storage_items ||--o{ retrieval_queue      : "queued for retrieval"
    storage_items ||--o{ storage_transactions : "tracked in transaction"
    storage_items ||--o{ order_items          : "part of order"

    orders ||--o{ order_items             : "line items"
    storage_compartments |o--o{ storage_transactions : "log per compartment"
    retrieval_queue |o--o{ storage_transactions       : "linked job"
    users |o--o{ retrieval_queue                      : "requested_by"
    users |o--o{ storage_transactions                 : "operator_id"
    users |o--o{ orders                               : "operator_id"
```

---

## ERD — Domain 3: Telemetry Time-Series

```mermaid
erDiagram
    machines {
        TEXT machine_id PK
    }

    machine_sensors {
        UUID sensor_id PK
        TEXT machine_id FK
    }

    mirac_sensor_data {
        BIGSERIAL id PK
        TIMESTAMP time
        TEXT machine_id FK
        UUID sensor_id FK
        FLOAT x_axis_value
        FLOAT y_axis_value
        FLOAT z_axis_value
        FLOAT x_axis_feed
        FLOAT y_axis_feed
        FLOAT z_axis_feed
        FLOAT spindle_speed
        FLOAT spindle_temperature
        FLOAT spindle_vibration
        SMALLINT tool_number
        FLOAT tool_temperature
        FLOAT tool_vibration
        BOOL led_red
        BOOL led_yellow
        BOOL led_green
        BOOL safety_curtain_status
    }

    triac_sensor_data {
        BIGSERIAL id PK
        TIMESTAMP time
        TEXT machine_id FK
        UUID sensor_id FK
        FLOAT x_axis_value
        FLOAT y_axis_value
        FLOAT z_axis_value
        FLOAT spindle_speed
        FLOAT spindle_temperature
        SMALLINT tool_number
        BOOL led_red
        BOOL led_green
    }

    vibit_readings {
        TIMESTAMP time
        TEXT machine_id FK
        UUID sensor_id FK
        SMALLINT modbus_unit_id
        FLOAT x_rms_acc
        FLOAT y_rms_acc
        FLOAT z_rms_acc
        FLOAT x_rms_vel
        FLOAT y_rms_vel
        FLOAT z_rms_vel
        FLOAT x_peak_acc
        FLOAT y_peak_acc
        FLOAT z_peak_acc
        FLOAT temperature
        FLOAT rpm
        SMALLINT led_status
    }

    energy_meter_data {
        TIMESTAMP time
        TEXT machine_id FK
        UUID sensor_id FK
        FLOAT average_voltage_ln
        FLOAT average_voltage_ll
        FLOAT average_current
        FLOAT total_net_kwh
    }

    assembly_station_data {
        TIMESTAMP time
        TEXT machine_id FK
        UUID sensor_id FK
        BOOL bearing_operation_status
        BOOL shaft_operation_status
        TEXT vice_status
        BOOL led_red
        BOOL led_yellow
        BOOL led_green
        BOOL safety_curtain_status
        FLOAT displacement_mm
    }

    machines ||--o{ mirac_sensor_data      : "records"
    machines ||--o{ triac_sensor_data      : "records"
    machines ||--o{ vibit_readings         : "records"
    machines ||--o{ energy_meter_data      : "records"
    machines ||--o{ assembly_station_data  : "records"

    machine_sensors ||--o{ mirac_sensor_data      : "from sensor"
    machine_sensors ||--o{ triac_sensor_data      : "from sensor"
    machine_sensors ||--o{ vibit_readings         : "from sensor"
    machine_sensors ||--o{ energy_meter_data      : "from sensor"
    machine_sensors ||--o{ assembly_station_data  : "from sensor"
```

---

## ERD — Domain 4: Workflow Engine (Future)

```mermaid
erDiagram
    machines {
        TEXT machine_id PK
    }

    workflows {
        UUID workflow_id PK
        TEXT name
        TEXT status
        TIMESTAMP created_at
        TIMESTAMP updated_at
        TIMESTAMP started_at
        TIMESTAMP completed_at
        TEXT error_msg
    }

    workflow_steps {
        UUID step_id PK
        UUID workflow_id FK
        INT step_order
        TEXT machine_id FK
        TEXT action
        JSONB parameters
        TEXT status
        TIMESTAMP started_at
        TIMESTAMP completed_at
        TEXT error_msg
    }

    workflows ||--o{ workflow_steps  : "has steps"
    machines  ||--o{ workflow_steps  : "executes on"
```

---

## Table Reference

| # | Table | Domain | Key Relationships |
|---|-------|--------|-------------------|
| 1 | `machines` | Core | Root table. All FKs trace back here. |
| 2 | `machine_sensors` | Core | Child of `machines`. Root for all telemetry. |
| 3 | `users` | Core | Referenced by events, orders, transactions. |
| 4 | `machine_events` | Core | Event log → `machines` + `machine_sensors` + `users`. |
| 5 | `machine_connections` | Core | OPC-UA session history → `machine_sensors`. |
| 6 | `storage_items` | ASRS | Item master catalog → `machines (asrs)`. |
| 7 | `storage_boxes` | ASRS | 35 grid boxes → `machines (asrs)`. `box_id` auto-computed by trigger. |
| 8 | `storage_compartments` | ASRS | 210 sub-slots → `storage_boxes` + `storage_items`. `compartment_id` auto-computed by trigger. |
| 9 | `retrieval_queue` | ASRS | Pending FIFO jobs → `storage_items` + `users`. |
| 10 | `storage_transactions` | ASRS | Append-only audit log. Never updated/deleted. |
| 11 | `shuttle_movements` | ASRS | Physical shuttle history. Latest row = current state. |
| 12 | `orders` | E-Commerce | Customer orders → `machines (asrs)` + `users`. |
| 13 | `order_items` | E-Commerce | Line items → `orders` + `storage_items`. `total_price` is GENERATED STORED. |
| 14 | `mirac_sensor_data` | Telemetry | 10Hz CNC Lathe time-series. |
| 15 | `triac_sensor_data` | Telemetry | 10Hz CNC Mill time-series (mirrors MIRAC). |
| 16 | `vibit_readings` | Telemetry | 8s Modbus vibration time-series. |
| 17 | `energy_meter_data` | Telemetry | Energy meter time-series. |
| 18 | `assembly_station_data` | Telemetry | Assembly PLC time-series. |
| 19 | `amr_sensor_data` | Placeholder | AMR position/navigation (future). |
| 20 | `cobot_sensor_data` | Placeholder | TM Cobot joint/TCP data (future). |
| 21 | `workflows` | Workflow Engine | Multi-machine workflow definitions (future). |
| 22 | `workflow_steps` | Workflow Engine | Individual steps per workflow (future). |

---

## Critical Design Notes for KT

### Trigger-Computed Primary Keys
Two tables have their PKs computed automatically by PostgreSQL `BEFORE INSERT` triggers, **not** by the application:
- `storage_boxes.box_id` = `row_label || col_number::TEXT` → e.g., `"A3"`
- `storage_compartments.compartment_id` = `box_id || sub_slot` → e.g., `"A3b"`

**⚠ Implication for developers**: Never manually set these PKs. Always let the trigger run. If you INSERT with a specific `box_id`, the trigger will **overwrite** it.

### `modbus_unit_id` Is NOT a Foreign Key
`vibit_readings.modbus_unit_id` is an **informational copy** of the Modbus slave address. It does not foreign-key reference `machine_sensors.modbus_unit_id` because that column is **not unique** (multiple unit IDs can share a gateway). The sensor is identified solely through `sensor_id (UUID)`.

### Append-Only Tables
`storage_transactions` is strictly append-only. No application code should ever `UPDATE` or `DELETE` from it. It is the audit trail of all physical ASRS movements.

### Operational Views
The schema ships with 4 views for convenience:
| View | Purpose |
|------|---------|
| `v_machine_status` | Live overview of all machines: sensor count, latest unresolved event |
| `v_shuttle_state` | Latest `shuttle_movements` row per machine = current physical state of the ASRS arm |
| `v_asrs_inventory` | Compartment map joined with item details. Filter `status = 'occupied'` for inventory |
| `v_active_sensors` | Active sensors with full machine context |

---

*Previous: [Use Case Diagram](./10_use_case_diagram.md)*
