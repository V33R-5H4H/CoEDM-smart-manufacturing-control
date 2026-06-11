# CoEDM API Documentation
## Version 1.0.0

**Base URL**: `http://localhost:8000`
**Interactive Swagger UI**: `http://localhost:8000/docs`
**OpenAPI JSON Spec**: `http://localhost:8000/openapi.json`

---

## Overview

The CoEDM API is a **FastAPI** application served via **Uvicorn** on port `8000`. It provides three categories of functionality:

1. **Real-Time Hardware Control**: REST endpoints that translate high-level commands (e.g., `BEARING_ON`) into OPC-UA writes to the physical PLCs.
2. **Inventory & Order Management**: CRUD operations for the ASRS 5×7 storage grid, items catalog, sub-compartments, transactions, and e-commerce order fulfillment.
3. **Data & Telemetry**: Retrieval of historical machine events, sensor readings, and connection logs from PostgreSQL.

---

## Authentication

Most machine control endpoints are **unauthenticated** (internal factory floor use).

E-Commerce endpoints are protected with **JWT Bearer tokens**:
```
Authorization: Bearer <token>
```
Tokens are issued by `POST /api/ecom/auth/login`.

---

## Documentation Files

| File | Contents |
|------|----------|
| [endpoints/README.md](endpoints/README.md) | Full reference for all REST endpoints with parameters, request bodies, and response examples |
| [schemas/README.md](schemas/README.md) | All Pydantic request/response schemas, inline payload formats, and WebSocket message formats |

---

## API Tags Summary

| Tag | Count | Description |
|-----|-------|-------------|
| `ASRS Control` | 7 | Shuttle commands, LED grid, connection lifecycle |
| `Assembly Control` | 4 | Hydraulic press commands, connection lifecycle |
| `MIRAC` | 5 | CNC Lathe vibit data, Modbus rate config, connection |
| `TRIAC` | 3 | CNC Mill connection lifecycle |
| `TM Cobot Control` | 2 | Cobot TCP reachability, script trigger |
| `ASRS Shuttle` | 1 | Current shuttle position from DB |
| `Boxes` | 5 | ASRS grid box CRUD |
| `Items` | 6 | Item master catalog CRUD |
| `SubCompartments` | 7 | Inventory slot management + physical ASRS store/retrieve |
| `Orders (ASRS)` | 6 | Order CRUD and status updates |
| `Transactions` | 5 | Append-only ASRS operation audit log |
| `ASRS Retrieval Queue` | 3 | FIFO retrieval job queue |
| `Machines` | 2 | Machine and sensor registry |
| `Users` | 2 | System user management |
| `Events & Alarms` | 3 | Machine event log and connection history |
| `Telemetry & Time-Series` | 1 | Historical telemetry data |
| `E-Commerce` | 11 | Public portal, JWT auth, and admin views |
| `Health` | 1 | System health check |

**Total: ~67 endpoints**
