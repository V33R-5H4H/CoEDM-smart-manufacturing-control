# SE Model 3: State Machine Diagrams (Statecharts)
## CoEDM Smart Manufacturing Control System

### Overview
State machine diagrams show the distinct states each major component can be in and the events/conditions that trigger transitions between states. Three statecharts are documented here, derived directly from the backend source code.

---

## Statechart 1: OPC-UA Connection Manager
*Source: `backend/communication/opcua_driver.py` — `OPCUAConnection` class*

The `OPCUAConnection` class manages a single persistent OPC-UA session per station (ASRS, MIRAC, TRIAC, Assembly). One instance exists per station.

```mermaid
stateDiagram-v2
    [*] --> Disconnected : instantiated

    Disconnected --> Connecting : connect() called

    Connecting --> Connected : _raw_connect() success
    Connecting --> Disconnected : connection refused / timeout

    Connected --> Monitoring : monitor thread started
    Monitoring --> Monitoring : health check OK (every 5s)
    Monitoring --> Reconnecting : read ns=0i=2259 fails

    Reconnecting --> Connected : _raw_connect() success
    Reconnecting --> Reconnecting : reconnect attempt failed

    Connected --> Disconnected : disconnect() called
    Monitoring --> Disconnected : disconnect() called

    note right of Connected
        self.connected = True
        Broadcaster reads PLC nodes
        Node cache is valid
    end note

    note right of Reconnecting
        Callbacks fired:
        _plc_node_cache.clear()
        Broadcaster re-subscribes
    end note
```

**Key transitions from code:**
| Event | From State | To State | Code |
|-------|-----------|----------|------|
| `connect()` called | Disconnected | Connecting | `opcua_driver.py:42` |
| TCP session established | Connecting | Connected | `_raw_connect()` |
| Health check fails every 5s | Monitoring | Reconnecting | `_monitor_loop():172` |
| Reconnect success | Reconnecting | Connected | `reconnect():74` |
| `disconnect()` called | Any | Disconnected | `_raw_disconnect()` |

---

## Statechart 2: ASRS Operation Lifecycle
*Source: `backend/stations/asrs/asrs_logic.py` — `ASRSLogic` class + shuttle state machine*

The ASRS system orchestrates both the database and the physical shuttle. The shuttle state is polled during retrieval operations.

```mermaid
stateDiagram-v2
    [*] --> Idle : system startup

    Idle --> ValidatingStore : Store command received
    Idle --> ValidatingRetrieve : Retrieve command received
    Idle --> Error : PLC connection lost

    ValidatingStore --> SendingPLC : item + box exist in DB
    ValidatingStore --> Idle : validation failed (item/box not found)

    SendingPLC --> UpdatingDB : PLC store command OK
    SendingPLC --> Idle : PLC command failed

    UpdatingDB --> Idle : compartment marked occupied + transaction logged
    UpdatingDB --> Idle : compartment already occupied (rollback)

    ValidatingRetrieve --> FindingLocations : inputs valid
    FindingLocations --> SendingPLC_Retrieve : locations found (quantity met)
    FindingLocations --> Idle : insufficient stock

    SendingPLC_Retrieve --> WaitingForShuttle : box command sent
    WaitingForShuttle --> SendingPLC_Retrieve : shuttle idle/error (next box)
    WaitingForShuttle --> WaitingForShuttle : shuttle busy (poll every 1s, timeout 90s)

    SendingPLC_Retrieve --> UpdatingDB_Retrieve : all PLC commands succeeded
    SendingPLC_Retrieve --> Idle : any PLC command failed

    UpdatingDB_Retrieve --> Idle : compartments marked empty + transactions logged

    Error --> Idle : connection restored
    Idle --> [*] : system shutdown

    note right of WaitingForShuttle
        get_shuttle_state()
        polls state every 1s
        returns "idle" or "error"
        to advance to next box
    end note
```

**Key states from code:**
| State | Meaning | Source |
|-------|---------|--------|
| `Idle` | No operation in progress | Initial / after commit |
| `ValidatingStore` | Checking item + box exist in DB | `asrs_logic.py:83-116` |
| `SendingPLC` | Issuing `{box_id}S` store pulse to ASRS PLC | `asrs_logic.py:119-137` |
| `UpdatingDB` | Marking compartment `occupied`, inserting transaction | `asrs_logic.py:139-207` |
| `WaitingForShuttle` | Polling `get_shuttle_state()` every 1s (max 90s) | `asrs_logic.py:341-347` |
| `UpdatingDB_Retrieve` | Marking compartments `empty`, inserting transactions | `asrs_logic.py:376-398` |

---

## Statechart 3: WebSocket Broadcaster (per station)
*Source: `backend/websockets/*_broadcaster.py` — e.g., `MiracBroadcaster`, `HydraulicBroadcaster`*

Each station has a dedicated broadcaster instance that manages the lifecycle of WebSocket clients and background polling tasks.

```mermaid
stateDiagram-v2
    [*] --> Idle : broadcaster instantiated

    Idle --> Broadcasting : first WebSocket client connects
    Broadcasting --> Broadcasting : additional clients connect

    Broadcasting --> SendingSnapshot : new client joins mid-session
    SendingSnapshot --> Broadcasting : initial snapshot sent

    state Broadcasting {
        [*] --> ReadingHardware
        ReadingHardware --> ComputingDelta : sensor data read
        ComputingDelta --> SendingDelta : delta has changes
        ComputingDelta --> SendingHeartbeat : no changes, tick % 50 == 0
        ComputingDelta --> ReadingHardware : no changes, heartbeat not due
        SendingDelta --> ReadingHardware : sent to all clients (100ms sleep)
        SendingHeartbeat --> ReadingHardware : sent to all clients (100ms sleep)

        ReadingHardware --> LoggingToDB : state changed OR 2s elapsed
        LoggingToDB --> ReadingHardware : DB write complete (asyncio.to_thread)
    }

    Broadcasting --> Idle : last client disconnects
    Broadcasting --> Idle : broadcast task cancelled
    Idle --> [*] : system shutdown

    note right of Broadcasting
        MIRAC: separate _modbus_poll_loop
        runs every 8s concurrently
        alongside the 10 Hz OPC-UA loop
    end note

    note right of ComputingDelta
        compute_delta() compares
        current vs _last_broadcast_payload
        Only changed keys are sent
    end note
```

**Key state data from code:**
| State | `is_broadcasting` | `active_connections` | Trigger |
|-------|------------------|---------------------|---------|
| `Idle` | `False` | `{}` (empty set) | No clients connected |
| `Broadcasting` | `True` | `{ws1, ws2, ...}` | ≥1 client connected |
| `SendingSnapshot` | `True` | New ws added | `connect()` → sends `_last_broadcast_payload` |

---

*Previous: [DFD Level 1](./02_dfd_level1.md)*
*Next: [Class Diagram](./04_class_diagram.md)*
