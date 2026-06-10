# SE Model 4: Class Diagram
## CoEDM Smart Manufacturing Control System

### Overview
This class diagram illustrates the primary Python classes in the backend application and how they map to physical hardware and database entities. It highlights the separation of concerns between hardware drivers, business logic controllers, WebSocket broadcasters, and data persistence.

---

```mermaid
classDiagram
    %% --- Hardware Drivers & Communication ---
    class OPCUAConnection {
        +String server_url
        +Client client
        +Boolean connected
        +connect()
        +disconnect()
        +reconnect()
        +get_node(tag_name) Node
        +pulse_node(tag_name, duration)
        +set_node_state(tag_name, value)
        -monitor_loop()
    }

    class VibitModbusReader {
        +String host
        +Int port
        +Int device_id
        +read_sensor_data() Dict
        -connect()
    }

    %% --- Broadcasters ---
    class MiracBroadcaster {
        +Set active_connections
        +Boolean is_broadcasting
        +connect(websocket)
        +disconnect(websocket)
        -_broadcast_loop()
        -_modbus_poll_loop()
        -compute_delta(current) Dict
    }
    
    class TriacBroadcaster {
        +Set active_connections
        +connect(websocket)
        +disconnect(websocket)
        -_broadcast_loop()
    }

    class AssemblyBroadcaster {
        +Set active_connections
        +connect(websocket)
        +disconnect(websocket)
        -_broadcast_loop()
    }

    %% --- ASRS Subsystem ---
    class ASRSController {
        +ShuttleState shuttle
        +LEDService led_service
        +connect()
        +disconnect()
        +run(command) Dict
        +get_shuttle_state() Dict
    }

    class ASRSLogic {
        +ASRSController asrs_controller
        +add_product_with_asrs(box_id, sub_id, item_id) Dict
        +retrieve_product_with_asrs(item_id, qty) Dict
        +retrieve_from_specific_location(box_id, sub_id, item_id) Dict
    }

    class LEDService {
        +update_grid(positions)
        +clear_grid()
    }

    %% --- Database (Data Access Layer) ---
    class DBHandler {
        <<Utility>>
        +SessionLocal session
        +log_to_db(table, data)
        +log_machine_event(...)
        +log_connection_event(...)
    }

    %% --- Database Entities (OR-Mapped) ---
    class MachineSensors {
        <<Entity>>
        +UUID sensor_id
        +String machine_id
        +String legacy_key
    }

    class TelemetryData {
        <<Entity>>
        +DateTime time
        +UUID sensor_id
        +Float metric_values...
    }

    class StorageCompartment {
        <<Entity>>
        +String compartment_id
        +String box_id
        +Int sub_slot
        +Int item_id
        +String status
        +Int quantity
    }

    class Order {
        <<Entity>>
        +Int order_id
        +String ecom_order_ref
        +String status
        +DateTime order_date
    }

    %% --- Relationships ---
    MiracBroadcaster "1" *-- "1" OPCUAConnection : uses
    MiracBroadcaster "1" *-- "3" VibitModbusReader : uses
    TriacBroadcaster "1" *-- "1" OPCUAConnection : uses
    TriacBroadcaster "1" *-- "1" VibitModbusReader : uses
    AssemblyBroadcaster "1" *-- "1" OPCUAConnection : uses

    ASRSLogic "1" o-- "1" ASRSController : orchestrates
    ASRSController "1" *-- "1" OPCUAConnection : uses
    ASRSController "1" *-- "1" LEDService : controls

    MiracBroadcaster ..> DBHandler : logs telemetry
    TriacBroadcaster ..> DBHandler : logs telemetry
    AssemblyBroadcaster ..> DBHandler : logs telemetry
    ASRSLogic ..> DBHandler : updates inventory

    DBHandler ..> MachineSensors : queries
    DBHandler ..> TelemetryData : inserts
    DBHandler ..> StorageCompartment : updates
    DBHandler ..> Order : reads/updates
```

---

## Component Descriptions

| Component Type | Classes | Responsibility |
|----------------|---------|----------------|
| **Drivers** | `OPCUAConnection`, `VibitModbusReader` | Manage low-level socket connections, reconnections, and protocol-specific reads/writes (OPC-UA and Modbus TCP). |
| **Broadcasters** | `MiracBroadcaster`, `TriacBroadcaster`, `AssemblyBroadcaster` | Maintain active WebSocket clients, poll drivers at 10Hz, compute state deltas, broadcast JSON to UI, and trigger DB writes. |
| **Business Logic** | `ASRSLogic`, `ASRSController`, `LEDService` | Implement complex orchestrations (e.g., ASRS order fulfillment). `ASRSLogic` ensures database updates only occur if PLC commands succeed. |
| **Persistence** | `DBHandler` (SessionLocal), Entity Classes | Handle async writes using `asyncio.to_thread` to prevent DB blocking from stalling the fast WebSocket broadcast loops. |

---

*Previous: [State Machine Diagrams](./03_state_machine_diagrams.md)*
