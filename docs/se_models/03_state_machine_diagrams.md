# SE Model 3: State Machine Diagrams (Statecharts)
## CoEDM Smart Manufacturing Control System

### Overview
State machine diagrams show the distinct states each major component can be in and the events/conditions that trigger transitions between states. Three statecharts are documented here, derived directly from the backend source code.

---

## Statechart 1: OPC-UA Connection Manager
*Source: `backend/communication/opcua_driver.py` — `OPCUAConnection` class*

```mermaid
stateDiagram-v2
    [*] --> Disconnected : instantiated

    Disconnected --> Connecting : connect() called
    Connecting --> Connected : session established
    Connecting --> Disconnected : refused / timeout

    Connected --> Monitoring : monitor thread started
    Monitoring --> Monitoring : health check OK every 5s
    Monitoring --> Reconnecting : health check fails

    Reconnecting --> Connected : reconnect success
    Reconnecting --> Reconnecting : reconnect failed

    Connected --> Disconnected : disconnect() called
    Monitoring --> Disconnected : disconnect() called

    Disconnected --> [*] : system shutdown
```

**Key transitions:**
| Event | From | To |
|-------|------|----|
| `connect()` called | Disconnected | Connecting |
| TCP session established | Connecting | Connected |
| Health check fails (every 5s) | Monitoring | Reconnecting |
| `_raw_connect()` succeeds | Reconnecting | Connected |
| `disconnect()` called | Any | Disconnected |
| System shutdown | Disconnected | End |

---

## Statechart 2: ASRS Operation Lifecycle
*Source: `backend/stations/asrs/asrs_logic.py` — `ASRSLogic` class*

```mermaid
stateDiagram-v2
    [*] --> Idle : system startup

    Idle --> ValidatingStore : Store command received
    Idle --> ValidatingRetrieve : Retrieve command received
    Idle --> Error : PLC connection lost

    ValidatingStore --> SendingPLC : item and box found in DB
    ValidatingStore --> Idle : validation failed

    SendingPLC --> UpdatingDB : PLC store OK
    SendingPLC --> Idle : PLC failed

    UpdatingDB --> Idle : compartment occupied, transaction logged
    UpdatingDB --> Idle : compartment already occupied, rollback

    ValidatingRetrieve --> FindingLocations : inputs valid
    FindingLocations --> SendingPLC_Retrieve : locations found
    FindingLocations --> Idle : insufficient stock

    SendingPLC_Retrieve --> WaitingForShuttle : box command sent
    WaitingForShuttle --> SendingPLC_Retrieve : shuttle returned idle
    WaitingForShuttle --> WaitingForShuttle : shuttle busy, poll 1s, max 90s

    SendingPLC_Retrieve --> UpdatingDB_Retrieve : all PLC commands succeeded
    SendingPLC_Retrieve --> Idle : any PLC command failed

    UpdatingDB_Retrieve --> Idle : compartments emptied, transactions logged

    Error --> Idle : connection restored
    Idle --> [*] : system shutdown
```

**Key states:**
| State | Meaning | Source |
|-------|---------|--------|
| `Idle` | No operation in progress | Initial / after commit |
| `ValidatingStore` | Checking item + box exist in DB | `asrs_logic.py:83` |
| `SendingPLC` | Issuing store pulse `{box_id}S` to PLC | `asrs_logic.py:119` |
| `UpdatingDB` | Marking compartment `occupied`, logging transaction | `asrs_logic.py:139` |
| `WaitingForShuttle` | Polling `get_shuttle_state()` every 1s (max 90s) | `asrs_logic.py:341` |
| `UpdatingDB_Retrieve` | Marking compartments `empty`, logging transactions | `asrs_logic.py:376` |

---

## Statechart 3: WebSocket Broadcaster (per station)
*Source: `backend/websockets/*_broadcaster.py` — `MiracBroadcaster`, `HydraulicBroadcaster`, etc.*

```mermaid
stateDiagram-v2
    [*] --> Idle : broadcaster instantiated

    Idle --> Broadcasting : first client connects
    Broadcasting --> Idle : last client disconnects
    Broadcasting --> Idle : task cancelled

    state Broadcasting {
        [*] --> ReadingHardware
        ReadingHardware --> ComputingDelta : sensor data received
        ComputingDelta --> SendingDelta : fields changed
        ComputingDelta --> SendingHeartbeat : no change, tick mod 50 = 0
        ComputingDelta --> ReadingHardware : no change, heartbeat not due
        SendingDelta --> ReadingHardware : sent, sleep 100ms
        SendingHeartbeat --> ReadingHardware : sent, sleep 100ms
        ReadingHardware --> LoggingToDB : state changed or 2s elapsed
        LoggingToDB --> ReadingHardware : write complete
    }

    Idle --> [*] : system shutdown
```

**Key state data:**
| State | `is_broadcasting` | `active_connections` | Trigger |
|-------|------------------|---------------------|---------|
| `Idle` | `False` | empty set | No clients |
| `Broadcasting` | `True` | one or more WS clients | First client connects |

---

*Previous: [DFD Level 1](./02_dfd_level1.md)*
*Next: [Class Diagram](./04_class_diagram.md)*
