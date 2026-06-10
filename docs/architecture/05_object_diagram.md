# SE Model 5: Object Diagrams
## CoEDM Smart Manufacturing Control System

### Overview
While a Class Diagram shows the static blueprint of the system, an **Object Diagram** shows a snapshot of the system at runtime. These diagrams illustrate the actual instances in memory at a specific moment in time.

---

## Snapshot 1: MIRAC Station Broadcasting at Runtime
**Scenario**: Two shop floor operators have the MIRAC station dashboard open in their browsers. The system is actively reading sensors and broadcasting data.

```mermaid
classDiagram
    %% Object definitions
    class mirac_broadcaster {
        <<MiracBroadcaster>>
        is_broadcasting = True
        _heartbeat_tick = 42
        _last_broadcast_payload = [ rpm: 1200, x_pos: 15.5 ]
    }

    class opc_conn {
        <<OPCUAConnection>>
        server_url = "opc.tcp://192.168.10.20:4840"
        connected = True
    }

    class vibit_reader_1 {
        <<VibitModbusReader>>
        device_id = 1
        host = "192.168.10.50"
    }

    class vibit_reader_2 {
        <<VibitModbusReader>>
        device_id = 2
        host = "192.168.10.50"
    }

    class ws_client_operator_A {
        <<WebSocket>>
        client_ip = "192.168.10.101"
        connection_state = CONNECTED
    }

    class ws_client_operator_B {
        <<WebSocket>>
        client_ip = "192.168.10.105"
        connection_state = CONNECTED
    }

    class current_db_session {
        <<SessionLocal>>
        transaction_active = False
    }

    %% Object Links
    mirac_broadcaster "1" *-- "1" opc_conn : owns
    mirac_broadcaster "1" *-- "1" vibit_reader_1 : owns
    mirac_broadcaster "1" *-- "1" vibit_reader_2 : owns
    
    mirac_broadcaster o-- ws_client_operator_A : active_connections
    mirac_broadcaster o-- ws_client_operator_B : active_connections
    
    mirac_broadcaster ..> current_db_session : spawns for async log writes
```

### Key Observations:
- There is exactly **one** `MiracBroadcaster` singleton handling the MIRAC station.
- It holds **one** persistent `OPCUAConnection` for PLC data.
- It holds **multiple** `VibitModbusReader` instances, all pointing to the same Modbus gateway IP but different `device_id`s.
- The two connected operators share the exact same `_last_broadcast_payload` cache in memory.

---

## Snapshot 2: ASRS Order Fulfillment Execution
**Scenario**: An E-Commerce order has triggered a retrieval for Box "C3". The ASRS logic has locked the database rows and the shuttle is currently moving to retrieve the box.

```mermaid
classDiagram
    %% Object definitions
    class active_logic {
        <<ASRSLogic>>
    }

    class singleton_controller {
        <<ASRSController>>
    }

    class shuttle_state {
        <<ShuttleState>>
        current_state = "busy"
        last_command = "C3"
    }

    class led_service {
        <<LEDService>>
        active_nodes = ["C3"]
    }

    class inventory_session {
        <<SessionLocal>>
        transaction_active = True
    }

    class compartment_c3a {
        <<StorageCompartment>>
        compartment_id = "C3a"
        item_id = 1024
        status = "reserved"
    }

    class compartment_c3b {
        <<StorageCompartment>>
        compartment_id = "C3b"
        item_id = 2048
        status = "reserved"
    }

    %% Object Links
    active_logic *-- singleton_controller : coordinates
    singleton_controller *-- shuttle_state : reads
    singleton_controller *-- led_service : updates

    active_logic ..> inventory_session : uses
    inventory_session o-- compartment_c3a : FOR UPDATE SKIP LOCKED
    inventory_session o-- compartment_c3b : FOR UPDATE SKIP LOCKED
```

### Key Observations:
- The `inventory_session` is holding an active transaction lock (`FOR UPDATE SKIP LOCKED`) on the target sub-compartment records to prevent other concurrent orders from claiming the same items.
- The `shuttle_state` indicates the hardware is physically `busy`.
- The `led_service` has already lit up the LEDs corresponding to Box `C3`.
- Once the shuttle state changes back to `idle`, `active_logic` will commit `inventory_session` and mark the compartments as `empty`.

---

*Previous: [Class Diagram](./04_class_diagram.md)*
