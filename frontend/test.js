export default `graph LR
    OP["Shop Floor Operator"]
    ADMIN["Admin / Engineer"]
    ASRS_HW["ASRS PLC<br/>(Omron NX / OPC-UA)"]
    ASSEMBLY_HW["Assembly Press PLC<br/>(AX-308EA0MA1P / OPC-UA)"]
    MIRAC_HW["MIRAC CNC Lathe<br/>(S7-1200 / OPC-UA)"]
    TRIAC_HW["TRIAC CNC Mill<br/>(Smart PC / OPC-UA)"]
    VIBIT["VibIT Sensors<br/>(Modbus TCP / RS-485)"]
    ECOM["E-Commerce Portal<br/>(Order Management)"]
    DB[("PostgreSQL<br/>Database")]

    SYSTEM["CoEDM Smart Manufacturing<br/>Control System"]

    OP -- "Control commands<br/>(Store, Retrieve, Press, Vice)" --> SYSTEM
    ADMIN -- "Configure settings<br/>View logs & reports" --> SYSTEM
    ECOM -- "Customer orders<br/>(item_id, qty)" --> SYSTEM

    SYSTEM -- "Real-time machine state<br/>(10 Hz WebSocket)" --> OP
    SYSTEM -- "Safety alerts & alarms<br/>(toast notifications)" --> OP
    SYSTEM -- "Historical reports<br/>Event logs" --> ADMIN

    ASRS_HW -- "LED grid states (35 nodes)<br/>Safety curtain<br/>Shuttle position" --> SYSTEM
    ASSEMBLY_HW -- "Piston displacement (mm)<br/>Vice state<br/>Safety lights (R/Y/G)" --> SYSTEM
    MIRAC_HW -- "Spindle RPM & temp<br/>Axis position & feed<br/>Tool data, LEDs" --> SYSTEM
    TRIAC_HW -- "Spindle RPM<br/>Axis feed, tool data" --> SYSTEM
    VIBIT -- "X/Y/Z RMS acc & vel<br/>Peak acc & vel<br/>Temperature (°C), RPM" --> SYSTEM

    SYSTEM -- "Store/Retrieve/Home pulse commands" --> ASRS_HW
    SYSTEM -- "BEARING_ON, SHAFT_ON<br/>VICE_OPEN, VICE_CLOSE" --> ASSEMBLY_HW
    SYSTEM -- "Log events & telemetry<br/>connection history" --> DB
    DB -- "Inventory, orders<br/>shuttle history, events" --> SYSTEM
`;
