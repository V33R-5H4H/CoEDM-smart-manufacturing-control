# SE Model 2: Data Flow Diagram (DFD Level 1)
## CoEDM Smart Manufacturing Control System — Internal Process Decomposition

### Overview
DFD Level 1 decomposes the single "CoEDM System" black box from the Context Diagram into its five major internal processes, showing how data flows between them, the external entities, and the data stores.

---

```mermaid
graph TD
    OP["Shop Floor Operator"]
    ADMIN["Admin / Engineer"]
    ASRS_HW["ASRS PLC"]
    ASSEMBLY_HW["Assembly PLC"]
    MIRAC_HW["MIRAC CNC"]
    TRIAC_HW["TRIAC CNC"]
    VIBIT["VibIT Sensors"]
    ECOM["E-Commerce"]

    DS1[("DS1: Telemetry DB")]
    DS2[("DS2: Orders DB")]
    DS3[("DS3: WS Cache")]

    P1["P1: REST API Handler"]
    P2["P2: Hardware Driver"]
    P3["P3: WS Broadcaster"]
    P4["P4: DB Writer"]
    P5["P5: Order Manager"]

    OP -- "Control Command" --> P1
    ADMIN -- "Reports / Logs" --> P1
    P1 -- "HTTP Response" --> OP
    P1 -- "Report Data" --> ADMIN

    P1 -- "Validated Command" --> P2
    P2 -- "OPC-UA Write" --> ASRS_HW
    P2 -- "OPC-UA Write" --> ASSEMBLY_HW

    P1 -- "Order Request" --> P5
    P5 -- "ASRS Trigger" --> P1

    ASRS_HW -- "LED + Safety States" --> P2
    ASSEMBLY_HW -- "Position + Vice + Lights" --> P2
    MIRAC_HW -- "Spindle + Axes + Tool" --> P2
    TRIAC_HW -- "Spindle + Axes" --> P2
    VIBIT -- "Vibration + Temp + RPM" --> P2

    P2 -- "Sensor Snapshot" --> P3

    P3 -- "Cache State" --> DS3
    DS3 -- "Initial Snapshot" --> P3

    P3 -- "WS: snapshot" --> OP
    P3 -- "WS: delta" --> OP
    P3 -- "WS: heartbeat" --> OP

    P3 -- "Telemetry Row" --> P4
    P3 -- "Connection Event" --> P4
    P3 -- "Machine Alarm" --> P4

    P4 -- "INSERT telemetry" --> DS1
    P4 -- "INSERT events" --> DS1
    P4 -- "INSERT connections" --> DS1

    DS1 -- "SELECT history" --> P1

    ECOM -- "New Order" --> P5
    P5 -- "INSERT order" --> DS2
    DS2 -- "Inventory Status" --> P5
    P5 -- "Order Confirmation" --> ECOM

    style P1 fill:#1a1a2e,color:#f5cb5c,stroke:#f5cb5c,stroke-width:2px
    style P2 fill:#1a1a2e,color:#f5cb5c,stroke:#f5cb5c,stroke-width:2px
    style P3 fill:#1a1a2e,color:#f5cb5c,stroke:#f5cb5c,stroke-width:2px
    style P4 fill:#1a1a2e,color:#f5cb5c,stroke:#f5cb5c,stroke-width:2px
    style P5 fill:#1a1a2e,color:#f5cb5c,stroke:#f5cb5c,stroke-width:2px
    style DS1 fill:#3b2a1a,color:#e0e0e0,stroke:#f59e0b,stroke-width:1px
    style DS2 fill:#3b2a1a,color:#e0e0e0,stroke:#f59e0b,stroke-width:1px
    style DS3 fill:#1a3a1a,color:#e0e0e0,stroke:#10b981,stroke-width:1px
    style OP fill:#16213e,color:#e0e0e0,stroke:#555,stroke-width:1px
    style ADMIN fill:#16213e,color:#e0e0e0,stroke:#555,stroke-width:1px
    style ASRS_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style ASSEMBLY_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style MIRAC_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style TRIAC_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style VIBIT fill:#1a3a2e,color:#e0e0e0,stroke:#10b981,stroke-width:1px
    style ECOM fill:#3b1a3b,color:#e0e0e0,stroke:#a855f7,stroke-width:1px
```

---

## Process Descriptions

| Process | Name | Source File(s) | Description |
|---------|------|----------------|-------------|
| **P1** | REST API Handler | `backend/api/routes/control/*/` | Validates incoming HTTP commands from the UI. Routes to the appropriate station controller or order handler. Returns HTTP JSON responses. |
| **P2** | Hardware Driver | `backend/communication/opcua_driver.py`, `vibit_modbus.py` | Manages persistent OPC-UA sessions (one per station) and a shared Modbus TCP gateway for all VibIT sensors. Handles reconnection, health monitoring, and node caching. |
| **P3** | WS Broadcaster | `backend/websockets/*_broadcaster.py` | Reads raw data from P2, builds a normalized JSON payload, computes a delta against the last broadcast, and pushes `snapshot`/`delta`/`heartbeat` messages over WebSocket at ~10 Hz. |
| **P4** | DB Writer | Inside `*_broadcaster.py` (`_log_to_db`, `_log_connection_event_db`) | Writes telemetry rows, machine event logs, and connection records to PostgreSQL asynchronously via `asyncio.to_thread()` to avoid blocking the broadcast loop. |
| **P5** | Order Manager | `backend/api/routes/ecom/`, `backend/stations/asrs/` | Handles the complete e-commerce order lifecycle — creates orders, marks sub-compartments as reserved/occupied, and triggers ASRS retrieve commands when required. |

---

## Data Store Descriptions

| Store | Tables | Purpose |
|-------|--------|---------|
| **DS1** | `machine_events`, `machine_connections`, `mirac_sensor_data`, `triac_sensor_data`, `vibit_readings`, `assembly_station_data` | Historical telemetry and audit trail |
| **DS2** | `orders`, `order_items`, `storage_items`, `storage_boxes`, `storage_compartments` | Inventory and order management |
| **DS3** | `_last_broadcast_payload` (in-memory dict) | WebSocket broadcaster cache for delta computation and initial snapshots |

---

## Key Design Decisions

1. **Dual polling rates**: P2 polls OPC-UA at **10 Hz** but VibIT Modbus at **8s intervals** (separate asyncio task) to prevent slow RS-485 reads blocking axis position updates.
2. **Delta compression**: P3 uses `compute_delta()` to only transmit changed fields, minimizing WebSocket bandwidth.
3. **Last-good cache**: P3 maintains a `_last_good_vibit*` cache so the frontend always shows the most recent valid reading when sensors drop temporarily.
4. **Non-blocking DB writes**: All P4 writes use `asyncio.to_thread()` keeping the broadcast loop at full speed.

---

*Previous: [Context Diagram (DFD L0)](./01_context_diagram_dfd_l0.md)*
*Next: [State Machine Diagrams](./03_state_machine_diagrams.md)*
