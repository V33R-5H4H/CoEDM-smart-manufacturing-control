# SE Model 1: Context Diagram (DFD Level 0)
## CoEDM Smart Manufacturing Control System

### Overview
A context diagram (DFD Level 0) defines the system boundary and shows all external entities that interact with the system and the high-level data flows between them.

---

```mermaid
graph LR
    %% External Entities (Actors)
    OP["Shop Floor Operator"]
    ADMIN["Admin / Engineer"]
    ASRS_HW["ASRS PLC<br/>(Codesys / OPC-UA)"]
    ASSEMBLY_HW["Assembly Press PLC<br/>(AX-308EA0MA1P / OPC-UA)"]
    MIRAC_HW["MIRAC CNC Lathe<br/>(OPC-UA)"]
    TRIAC_HW["TRIAC CNC Mill<br/>(OPC-UA)"]
    VIBIT["VibIT Sensors<br/>(Modbus TCP / RS-485)"]
    ECOM["E-Commerce Portal<br/>(Order Management)"]
    DB[("PostgreSQL<br/>Database")]

    %% The System
    SYSTEM["CoEDM Smart Manufacturing<br/>Control System"]

    %% Flows FROM Operators/Admin TO System
    OP -- "Control commands<br/>(Store, Retrieve, Press, Vice)" --> SYSTEM
    OP -- "Dashboard view request" --> SYSTEM
    ADMIN -- "Configure settings<br/>View logs & reports" --> SYSTEM
    ECOM -- "Customer orders<br/>(Item, Sub-ID, Compartment)" --> SYSTEM

    %% Flows FROM System TO Operators/Admin
    SYSTEM -- "Real-time machine state<br/>(Running / Idle / Error)" --> OP
    SYSTEM -- "Safety alerts & alarms" --> OP
    SYSTEM -- "Historical reports<br/>Event logs" --> ADMIN

    %% Flows FROM Hardware TO System
    ASRS_HW -- "LED grid states<br/>Safety curtain signal<br/>Shuttle position" --> SYSTEM
    ASSEMBLY_HW -- "Piston displacement (mm)<br/>Vice state<br/>Safety lights (R/Y/G)<br/>Buzzer state" --> SYSTEM
    MIRAC_HW -- "Spindle RPM<br/>Spindle temperature<br/>Axis position & feed<br/>Tool data" --> SYSTEM
    TRIAC_HW -- "Spindle RPM<br/>Axis feed rate<br/>Tool data" --> SYSTEM
    VIBIT -- "Vibration (X/Y/Z RMS)<br/>Acceleration & velocity<br/>Sensor temperature<br/>RPM" --> SYSTEM

    %% Flows FROM System TO Hardware (Control Commands)
    SYSTEM -- "Store/Retrieve/Home<br/>pulse commands" --> ASRS_HW
    SYSTEM -- "BEARING_ON, SHAFT_ON<br/>VICE_OPEN, VICE_CLOSE<br/>(OPC-UA write)" --> ASSEMBLY_HW

    %% Flows to/from Database
    SYSTEM -- "Log events, transactions<br/>connection history<br/>telemetry snapshots" --> DB
    DB -- "Inventory counts<br/>Order status<br/>Shuttle history<br/>Event log" --> SYSTEM

    %% Styling
    style SYSTEM fill:#1a1a2e,color:#f5cb5c,stroke:#f5cb5c,stroke-width:3px
    style OP fill:#16213e,color:#e0e0e0,stroke:#555,stroke-width:1px
    style ADMIN fill:#16213e,color:#e0e0e0,stroke:#555,stroke-width:1px
    style ASRS_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style ASSEMBLY_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style MIRAC_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style TRIAC_HW fill:#0d3b66,color:#e0e0e0,stroke:#2a7cc7,stroke-width:1px
    style VIBIT fill:#1a3a2e,color:#e0e0e0,stroke:#10b981,stroke-width:1px
    style ECOM fill:#3b1a3b,color:#e0e0e0,stroke:#a855f7,stroke-width:1px
    style DB fill:#3b2a1a,color:#e0e0e0,stroke:#f59e0b,stroke-width:1px
```

---

## External Entities Description

| Entity | Type | Protocol | Description |
|--------|------|----------|-------------|
| **Shop Floor Operator** | Human Actor | Web UI (HTTP/WS) | Issues control commands, monitors machine states in real time |
| **Admin / Engineer** | Human Actor | Web UI (HTTP/WS) | Views historical logs, configures system settings, reviews reports |
| **ASRS PLC** | Hardware | OPC-UA (`opc.tcp://`) | 5×7 LED grid, shuttle position, safety curtain (35 nodes subscribed) |
| **Assembly Press PLC** | Hardware | OPC-UA (`opc.tcp://`) | AX-308EA0MA1P: displacement, vice state, safety lights, buzzer |
| **MIRAC CNC Lathe** | Hardware | OPC-UA (`opc.tcp://`) | Spindle RPM/temp, X/Z axis position & feed, tool state, LEDs |
| **TRIAC CNC Mill** | Hardware | OPC-UA (`opc.tcp://`) | Spindle RPM, X-axis feed, tool data |
| **VibIT Sensors** | Hardware | Modbus TCP (RS-485 Gateway @ port 502) | X/Y/Z RMS vibration, acceleration, velocity, temperature; shared gateway for all unit IDs |
| **E-Commerce Portal** | External System | REST API (HTTP) | Places customer orders, links items to specific ASRS sub-compartments |
| **PostgreSQL Database** | Data Store | SQLAlchemy / SQL | Persists events, telemetry, inventory, orders, connection history |

---

## Key Data Flows

### Inbound to System (Sensor/Command Data)
- **OPC-UA Subscriptions**: ASRS (100ms poll), Assembly (async read), MIRAC & TRIAC (continuous poll)
- **Modbus TCP Reads**: VibIT sensors polled at ~10 Hz via a single shared TCP gateway connection
- **HTTP POST**: Control commands from the React frontend via REST API endpoints

### Outbound from System (Display/Control)
- **WebSocket Broadcast**: Real-time delta messages sent to all connected frontend clients
- **OPC-UA Writes**: Direct node state writes for assembly control (e.g., `set_node_state()`, `pulse_node()`)
- **PostgreSQL Inserts**: All events, connections, and telemetry snapshots logged with IST timestamps

---

*Next: [DFD Level 1 — Internal Process Decomposition](./02_dfd_level1.md)*

