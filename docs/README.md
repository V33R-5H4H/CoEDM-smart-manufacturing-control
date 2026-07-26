# CoEDM Documentation Index

> **Start here.** This is the master index for all CoEDM platform documentation.
> If you are new to this project, read [`HANDOVER.md`](HANDOVER.md) first.

---

## 🆕 Handover & Onboarding

| Document | Description |
|----------|-------------|
| [HANDOVER.md](HANDOVER.md) | **⭐ Read first.** System overview, what works, what's stubbed, and next steps for a new developer |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to add a new station, extend the API, modify the database schema, or contribute new features |

---

## User Guides

| Document | Description |
|----------|-------------|
| [USER_MANUAL.md](USER_MANUAL.md) | Step-by-step operating instructions for shop floor operators and e-commerce admins |
| [guides/setup_and_deployment_guide.md](guides/setup_and_deployment_guide.md) | Full setup from scratch (Python venv, DB init, frontend) and Docker production deployment |
| [guides/database_schema_and_migration.md](guides/database_schema_and_migration.md) | How to apply the DB schema, seed data, and run future migrations |
| [guides/opc_ua_hardware_integration.md](guides/opc_ua_hardware_integration.md) | OPC-UA node ID reference, connection troubleshooting, and adding new PLC tags |
| [guides/software_master_guide.md](guides/software_master_guide.md) | High-level developer orientation: directory structure, services, key files |

---

## API Documentation

| Document | Description |
|----------|-------------|
| [api/API_README.md](api/API_README.md) | Base URL, authentication, and summary of all 67 endpoints by tag |
| [api/endpoints/Endpoints.md](api/endpoints/Endpoints.md) | Full REST endpoint reference with request bodies and response examples |
| [api/schemas/Schemas.md](api/schemas/Schemas.md) | All Pydantic request/response schemas and WebSocket message formats |

---

## Architecture & System Engineering Models

All 11 SE models are in [`architecture/`](architecture/). They render as Mermaid diagrams in any Markdown viewer (GitHub, VS Code with Mermaid plugin, etc.).

| Model | File | Description |
|-------|------|-------------|
| DFD Level 0 | [01_context_diagram_dfd_l0.md](architecture/01_context_diagram_dfd_l0.md) | External entities and high-level system boundary |
| DFD Level 1 | [02_dfd_level1.md](architecture/02_dfd_level1.md) | Internal process decomposition (P1–P5) and data stores |
| State Machine Diagrams | [03_state_machine_diagrams.md](architecture/03_state_machine_diagrams.md) | OPC-UA connection, ASRS lifecycle, WebSocket broadcaster |
| Class Diagram | [04_class_diagram.md](architecture/04_class_diagram.md) | Python class relationships (drivers, broadcasters, logic) |
| Object Diagrams | [05_object_diagram.md](architecture/05_object_diagram.md) | Runtime memory snapshots (MIRAC broadcasting, ASRS retrieval) |
| Sequence Diagrams | [06_sequence_diagrams.md](architecture/06_sequence_diagrams.md) | ASRS order fulfillment and 10 Hz WS telemetry loop |
| Activity Diagrams | [07_activity_diagrams.md](architecture/07_activity_diagrams.md) | ASRS store product logic and OPC-UA auto-reconnect flow |
| Component Diagram | [08_component_diagram.md](architecture/08_component_diagram.md) | Software module boundaries and inter-module interfaces |
| Deployment Diagram | [09_deployment_diagram.md](architecture/09_deployment_diagram.md) | Physical nodes, ports, and OT network segmentation |
| Use Case Diagram | [10_use_case_diagram.md](architecture/10_use_case_diagram.md) | Actor interactions (Operator, Admin, E-Commerce portal) |
| ERD — Database Schema | [11_erd.md](architecture/11_erd.md) | All 22 tables, relationships, domains, and design decisions |

---

## Reference Docs (Deep Technical Detail)

These live in [`../reference/docs/`](../reference/docs/) — more implementation-focused than the architecture models.

| Document | Description |
|----------|-------------|
| [../reference/docs/DATA_FLOW.md](../reference/docs/DATA_FLOW.md) | How data flows from PLC → broadcaster → WebSocket → React (telemetry + command path) |
| [../reference/docs/NETWORK_TOPOLOGY.md](../reference/docs/NETWORK_TOPOLOGY.md) | Full `10.10.14.0/24` device map, protocol details, known hardware issues |
| [../reference/docs/FRONTEND_ARCHITECTURE.md](../reference/docs/FRONTEND_ARCHITECTURE.md) | React structure, WebSocket pattern, physics animation, design tokens |
| [../reference/docs/station_capabilities_audit.md](../reference/docs/station_capabilities_audit.md) | Per-station gap analysis: what works, what's stubbed, what to add next |
| [../reference/docs/INTERVIEW_GUIDE.md](../reference/docs/INTERVIEW_GUIDE.md) | Architecture decisions, engineering challenges, and key metrics |

---

## Academic Report

| Document | Description |
|----------|-------------|
| [CoEDM_Smart_Manufacturing_Project_Report.md](CoEDM_Smart_Manufacturing_Project_Report.md) | Full 4-chapter academic project report (submitted for 4EL33 Industry Defined Project) |

---

## Quick Reference

```powershell
# Start full stack
python start.py

# Stop
python stop.py

# Run all tests
backend\venv\Scripts\python.exe -m pytest backend\tests\ -q

# Network + hardware diagnostic
backend\venv\Scripts\python.exe reference\scripts\discovery\modbus_diagnostic.py

# Scan for devices on 10.10.14.0/24
backend\venv\Scripts\python.exe reference\scripts\discovery\network_discovery.py --range 100-130
```

| Service | URL |
|---------|-----|
| React HMI | `http://localhost:5173` |
| FastAPI Swagger | `http://localhost:8000/docs` |
| OpenAPI JSON | `http://localhost:8000/openapi.json` |
