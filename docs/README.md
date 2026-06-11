# CoEDM Documentation Index

| Document | Description |
|---|---|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | What the project is, tech stack, repository layout |
| [DATA_FLOW.md](DATA_FLOW.md) | How data moves from machines to browser (telemetry + command paths) |
| [COMMAND_FLOWS.md](COMMAND_FLOWS.md) | Step-by-step command flows for every station + full API reference |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | All 20+ tables, columns, relationships, and design decisions |
| [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md) | React structure, design system, WebSocket pattern, animations |
| [NETWORK_TOPOLOGY.md](NETWORK_TOPOLOGY.md) | Device map, protocol details, connection state machines |
| [INTERVIEW_GUIDE.md](INTERVIEW_GUIDE.md) | How to explain the project in an interview — decisions, challenges, learnings |

## Architecture & System Engineering Models

| Model | Description |
|---|---|
| [Context Diagram (DFD L0)](architecture/01_context_diagram_dfd_l0.md) | External entities and high-level system boundaries |
| [Data Flow Diagram (DFD L1)](architecture/02_dfd_level1.md) | Internal process decomposition and data stores |
| [State Machine Diagrams](architecture/03_state_machine_diagrams.md) | Statecharts for OPC-UA, ASRS operations, and WS Broadcasters |
| [Class Diagram](architecture/04_class_diagram.md) | Python classes mapping to physical hardware and DB entities |
| [Object Diagrams](architecture/05_object_diagram.md) | Runtime memory snapshots of the system in action |
| [Sequence Diagrams](architecture/06_sequence_diagrams.md) | Flow of ASRS order fulfillment and WS telemetry loop |
| [Activity Diagrams](architecture/07_activity_diagrams.md) | Decision logic flows for ASRS and PLC health monitoring |
| [Component Diagram](architecture/08_component_diagram.md) | Software modular architecture and module boundaries |
| [Deployment Diagram](architecture/09_deployment_diagram.md) | Physical node layout, networking, and port mappings |
| [Use Case Diagram](architecture/10_use_case_diagram.md) | Actor interactions and automated fulfillment workflows |

## Quick Reference

```
Start:   python start.py
Stop:    python stop.py
Tests:   backend\venv\Scripts\python.exe -m pytest backend\tests\ -q
Diag:    backend\venv\Scripts\python.exe reference\scripts\discovery\modbus_diagnostic.py
API:     http://localhost:8000/docs
App:     http://localhost:5173
```
