# CoEDM Platform — Handover Guide

> **This is the first document a new developer, intern, or lab operator should read.**
> It tells you what the system is, what works today, what is still stubbed, and exactly what to do next.

---

## 1. What This System Does (30-Second Version)

The CoEDM lab has 6 machines from different manufacturers, each speaking a different industrial protocol. Before this project, each machine was operated separately using dedicated engineering software (Sysmac Studio for the ASRS, Codesys IDE for the press, Node-RED for CNC sensors). There was no unified dashboard, no persistent data logging, and no way to automate cross-machine workflows.

This platform is a **web-based SCADA system** that:
1. Connects to all machines over **OPC-UA** (PLCs) and **Modbus TCP** (vibration sensors)
2. Streams live machine data to any browser at **10 Hz** via WebSockets
3. Lets operators issue machine commands from the web UI
4. Logs everything to a **PostgreSQL database** for historical analysis
5. Automates **ASRS inventory management** and **e-commerce order fulfillment**

---

## 2. System at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│                    Central Edge Server (localhost)              │
│                                                                 │
│  ┌──────────────────┐    ┌─────────────────────────────────┐   │
│  │  React HMI       │    │   FastAPI / Uvicorn             │   │
│  │  Port: 5173      │◄──►│   Port: 8000                    │   │
│  │  8 station pages │    │   67 REST endpoints             │   │
│  │  WebSocket       │    │   5 WebSocket endpoints         │   │
│  │  delta protocol  │    │   Async OPC-UA + Modbus readers │   │
│  └──────────────────┘    └──────────┬──────────────────────┘   │
│                                     │                           │
│                          ┌──────────▼──────────┐               │
│                          │  PostgreSQL 15       │               │
│                          │  Port: 5432          │               │
│                          │  22 tables (CoEDM_db)│               │
│                          └─────────────────────-┘               │
└─────────────────────────────────────────────────────────────────┘
         │ OPC-UA opc.tcp://          │ Modbus TCP port 502
         ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐
│ Factory Floor PLCs   │    │ VibIT Sensor Gateways │
│ 10.10.14.104:4840    │    │ 10.10.14.103:502      │
│ 10.10.14.113:4840    │    │ 10.10.14.129:502      │
│ 10.10.14.102:4840    │    │ (Modbus → RS-485 bus) │
│ 10.10.14.124:4840    │    └──────────────────────┘
└──────────────────────┘
```

---

## 3. What Is Fully Built & Working ✅

| Component | Status | Notes |
|-----------|--------|-------|
| **ASRS Station** | ✅ Complete | Store/retrieve/home commands via OPC-UA; 5×7 LED grid; full inventory CRUD (35 boxes, 210 slots); order fulfillment |
| **Assembly Press** | ✅ Complete | BEARING_ON, SHAFT_ON, VICE_OPEN/CLOSE via OPC-UA; live piston displacement; safety curtain alerts |
| **MIRAC CNC Lathe** | ✅ Monitoring | OPC-UA read of all tags (spindle RPM, axes, tool, LEDs); Modbus VibIT sensor polling |
| **TRIAC CNC Mill** | ✅ Monitoring | OPC-UA connected; G-code coordinate display; delta WebSocket |
| **E-Commerce API** | ✅ Complete | JWT auth; order placement → ASRS retrieval pipeline; admin views |
| **PostgreSQL MES DB** | ✅ Complete | 22 tables; all telemetry tables; inventory + orders; event log |
| **React HMI (8 pages)** | ✅ Complete | Dashboard, ASRS, Assembly, MIRAC, TRIAC (live) + Testing, AMR, Cobot (simulated) |
| **Health Monitoring** | ✅ Complete | OPC-UA auto-reconnect (5 s interval); health endpoint; status dot in UI |
| **Test Suite** | ✅ Complete | 152 pytest tests passing |

---

## 4. What Is Stubbed / Not Yet Integrated ❌

| Component | Status | Location | What's Missing |
|-----------|--------|----------|----------------|
| **MIRAC OPC-UA writes** | ❌ Not built | `backend/stations/mirac/` | No `POST /control/mirac/command` endpoint; can only read, not control |
| **MIRAC disconnect route** | ❌ Not built | `backend/api/routes/control/mirac/` | `disconnect_mirac()` exists in station but has no HTTP route |
| **Workflow Engine** | 🔲 Schema only | DB tables `workflows`, `workflow_steps` | Tables exist but no application code reads/writes them |
| **JWT Auth (HMI)** | 🔲 Not activated | `backend/api/routes/users.py` | `users` table and schema exist; auth not wired to routes |
| **Dashboard live metrics** | ⚠️ Hardcoded | `frontend/src/pages/Dashboard.jsx` | Shows hardcoded numbers; planned: real WebSocket + REST |

---

## 5. Known Hardware Issues (May 2026)

| Device | IP | Issue | Recommended Action |
|--------|-----|-------|-------------------|
| MIRAC VibIT Sensors | `10.10.14.103:502` | ✅ Active / Perfect Health | RS-485 daisy chain operating normally |
| TRIAC VibIT Gateway | `10.10.14.129:502` | ✅ Active / Perfect Health | RS-485 daisy chain operating normally |
| AMR Mobile Robot | `10.10.14.122:502` | ✅ Active / Integrated | Communicating normally over Modbus TCP |
| TM Cobot | `10.10.14.106:5890` | ✅ Active / Integrated | Communicating normally over raw TCP/TMSCT |

---

## 6. How to Verify the System Is Working

### 6.1 Start the stack
```powershell
python start.py
```
Wait ~10 seconds for OPC-UA sessions to establish.

### 6.2 Check health endpoint
```
GET http://localhost:8000/api/health
```
Expected response:
```json
{
  "status": "SYS_OP_NORMAL",
  "database": "connected",
  "stations": {
    "asrs": { "connected": true },
    "assembly": { "connected": true },
    "mirac": { "connected": true },
    "triac": { "connected": true or false }
  }
}
```

### 6.3 Open the HMI
Navigate to `http://localhost:5173` — you should see the dashboard. Click each station tab and verify the status dot is green.

### 6.4 Run hardware diagnostics
```powershell
# Probe all Modbus devices on the subnet
backend\venv\Scripts\python.exe reference\scripts\discovery\modbus_diagnostic.py

# Scan for all active devices on 10.10.14.0/24
backend\venv\Scripts\python.exe reference\scripts\discovery\network_discovery.py
```

---

## 7. File Map — Where to Find Things

### Backend Key Files

| File | Purpose |
|------|---------|
| `backend/api/main.py` | FastAPI app, CORS config, all router registrations, startup/shutdown lifecycle |
| `backend/config.py` | Reads `backend/.env` — all IPs, DB URL, log level |
| `backend/communication/opcua_driver.py` | `OPCUAConnection` class — the OPC-UA session manager |
| `backend/communication/vibit_modbus.py` | `VibitModbusReader` — float32 decode, profile auto-detection |
| `backend/core/delta.py` | `build_snapshot_message()`, `build_delta_message()`, `compute_delta()` |
| `backend/core/timezone.py` | `ist_now()` — returns `datetime.now(IST)` for all timestamps |
| `backend/stations/asrs/asrs_logic.py` | `ASRSLogic` — store/retrieve with DB validation before PLC command |
| `backend/stations/asrs/led_service.py` | `LEDService` — edge detection for shuttle operation complete |
| `backend/websockets/mirac_broadcaster.py` | Combined OPC-UA + VibIT Modbus broadcast at 1 Hz |
| `backend/database/Integrated_Schema_v2.sql` | **Full 22-table PostgreSQL schema** — apply this on fresh DB |
| `backend/database/db.py` | SQLAlchemy `engine`, `SessionLocal`, `verify_db()` |

### Frontend Key Files

| File | Purpose |
|------|---------|
| `frontend/src/App.jsx` | Routes, bottom nav, health polling (GET /api/health every 5s) |
| `frontend/src/utils/deepMerge.js` | Recursive merge for WebSocket delta patches |
| `frontend/src/styles/tokens.css` | All CSS custom properties (dark industrial color palette) |
| `frontend/src/pages/asrs/Dashboard.jsx` | Most complex page — 5×7 LED grid, CRUD, tabs |
| `frontend/src/pages/Assembly.jsx` | Hydraulic press schematic + spring animation |
| `frontend/src/pages/Mirac.jsx` | CNC lathe monitoring + VibIT panels |
| `frontend/vite.config.js` | Vite proxy `/api/*` → `localhost:8000` (including WS upgrade) |

### Configuration Files

| File | What to Change |
|------|---------------|
| `backend/.env` | `DATABASE_URL`, all hardware IPs, `LOG_LEVEL` |
| `backend/.env.example` | Template — copy to `.env` and fill in |
| `backend/config.py` | Pydantic Settings class that reads `.env` |

---

## 8. Environment Variables (`.env`)

```ini
# backend/.env
DATABASE_URL=postgresql://coedm:coedm_password@localhost:5432/coedm_db

# Hardware IPs (10.10.14.0/24 factory subnet)
ASRS_HOST=10.10.14.104
ASRS_PORT=4840
ASSEMBLY_HOST=10.10.14.113
ASSEMBLY_PORT=4840
MIRAC_HOST=10.10.14.102
MIRAC_PORT=4840
MIRAC_VIBIT_HOST=10.10.14.103
MIRAC_VIBIT_PORT=502
TRIAC_HOST=10.10.14.124
TRIAC_PORT=4840
TRIAC_VIBIT_HOST=10.10.14.129
TRIAC_VIBIT_PORT=502
AMR_HOST=10.10.14.122
AMR_PORT=502
COBOT_HOST=10.10.14.106
COBOT_PORT=5890

LOG_LEVEL=INFO
```

> **Note:** The `.env` file must be on the same physical network as the lab machines (`10.10.14.0/24`). Running from home without VPN access will give `[Errno 10061] Connect call failed` on all OPC-UA connections.

---

## 9. Suggested Next Steps (Priority Order)

### Immediate Enhancements
1. **MIRAC write endpoint** — Add `POST /api/control/mirac/command` route (the OPCUAConnection object already exists; just need to wire it to a route)
2. **MIRAC disconnect route** — Expose `disconnect_mirac()` as a HTTP route (15-minute task)
3. **Dashboard live metrics** — Replace hardcoded values in `Dashboard.jsx` with real API calls
4. **JWT auth for HMI** — `users` table and Pydantic schemas exist; need to add auth middleware to routes

### Long-Term (1–2 months)
5. **Workflow Engine** — `workflows` and `workflow_steps` DB tables are designed; need state machine dispatcher
6. **FFT Predictive Maintenance** — Extend VibIT reader to capture time-domain samples and compute FFT spectrum

---

## 10. Where to Ask for Help

- **OPC-UA tag issues**: Run `reference/scripts/discovery/discover_tags.py` to browse all available nodes on any PLC
- **Modbus register mapping**: Run `modbus_diagnostic.py --verbose --host <ip>` to dump raw register values
- **Database issues**: The full schema is self-documenting in `backend/database/Integrated_Schema_v2.sql`
- **API endpoints**: Open `http://localhost:8000/docs` — all 67 endpoints are documented with example payloads
- **Architecture**: All 11 SE models in `docs/architecture/` explain every component with Mermaid diagrams

---

*Last updated: July 2026 | CoEDM Internship — BVM Engineering College*
