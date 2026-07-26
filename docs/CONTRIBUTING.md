# Contributing to CoEDM — Developer Guide

This guide explains how to add new features, integrate new hardware stations, or extend the existing codebase. Read [`HANDOVER.md`](HANDOVER.md) first if you are new to the project.

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [Adding a New API Endpoint](#2-adding-a-new-api-endpoint)
3. [Adding a New Hardware Station](#3-adding-a-new-hardware-station)
4. [Adding a New OPC-UA Tag](#4-adding-a-new-opc-ua-tag)
5. [Adding a New Modbus Sensor](#5-adding-a-new-modbus-sensor)
6. [Adding a New Database Table](#6-adding-a-new-database-table)
7. [Adding a New Frontend Page](#7-adding-a-new-frontend-page)
8. [Code Style & Conventions](#8-code-style--conventions)
9. [Running Tests](#9-running-tests)
10. [Git Workflow](#10-git-workflow)

---

## 1. Development Environment Setup

```powershell
# Clone and set up Python environment
git clone <repo-url>
cd CoEDM-smart-manufacturing-control

cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Copy and configure environment
copy .env.example .env
# Edit .env with real IPs and DB URL

# Set up the database (first time only)
# Start PostgreSQL, then:
psql -U <user> -d coedm_db -f database\Integrated_Schema_v2.sql

# Start frontend
cd ..\frontend
npm install

# Start everything
cd ..
python start.py
```

**Verify setup:**
- API Swagger: `http://localhost:8000/docs`
- React HMI: `http://localhost:5173`
- Health: `http://localhost:8000/api/health`

---

## 2. Adding a New API Endpoint

### 2.1 Choose the right router file

| What the endpoint does | Router location |
|------------------------|-----------------|
| Machine command (write to PLC) | `backend/api/routes/control/<station>/<station>_control.py` |
| Database read (telemetry, inventory) | `backend/api/routes/data/<resource>_router.py` |
| E-commerce operation | `backend/api/routes/ecom/` |

### 2.2 Write the endpoint

```python
# backend/api/routes/control/mirac/mirac_control.py
from fastapi import APIRouter
from backend.stations.mirac.cnc_mirac_station import mirac_connection

router = APIRouter(prefix="/api/control/mirac", tags=["MIRAC"])

@router.post("/command")
async def send_mirac_command(command: str):
    """
    Write an OPC-UA value to the MIRAC CNC.
    Example: command='CYCLE_START' writes True to the cycle start node.
    """
    if command not in MIRAC_COMMAND_TAGS:
        raise HTTPException(status_code=400, detail=f"Unknown command: {command}")
    
    node_id = MIRAC_COMMAND_TAGS[command]
    # OPC-UA write runs in a thread to avoid blocking the event loop
    await asyncio.to_thread(mirac_connection.set_node_state, node_id, True)
    return {"success": True, "command": command}
```

### 2.3 Register the router in `main.py`

```python
# backend/api/main.py
from backend.api.routes.control.mirac.mirac_control import router as mirac_router
app.include_router(mirac_router)
```

### 2.4 Write a test

```python
# backend/tests/test_mirac_control.py
from httpx import AsyncClient
import pytest

@pytest.mark.asyncio
async def test_send_mirac_command_unknown(client: AsyncClient):
    response = await client.post("/api/control/mirac/command", params={"command": "INVALID"})
    assert response.status_code == 400
```

---

## 3. Adding a New Hardware Station

Use the **AMR** stub as a template — it has the correct directory structure but empty files.

### 3.1 Create the station module

```
backend/stations/<station_name>/
├── __init__.py
├── <station>_station.py      ← Tag map, OPCUAConnection instance (or ModbusDriver)
└── <station>_backend.py      ← Data reading + data normalization logic
```

**`<station>_station.py` template (OPC-UA station):**

```python
# backend/stations/triac/cnc_triac_station.py
from backend.communication.opcua_driver import OPCUAConnection
from backend.config import settings

# OPC-UA Tag Map — add your actual node IDs here
TRIAC_DATA_TAGS = {
    "spindle_rpm":    "ns=4, s=Spindle.Speed",
    "tool_number":    "ns=4, s=Tool.Number",
    # ... add more tags
}

# Singleton connection — shared across broadcaster and routes
triac_connection = OPCUAConnection(
    server_url=f"opc.tcp://{settings.TRIAC_HOST}:{settings.TRIAC_PORT}"
)
```

### 3.2 Create the WebSocket broadcaster

```
backend/websockets/<station>_broadcaster.py
```

Copy `assembly_broadcaster.py` as a template. Change:
- The `import` to your station's connection object and tag map
- The `_read_station_data()` method to read your actual tags
- The DB write function to log to your telemetry table

### 3.3 Create the API router

```
backend/api/routes/control/<station>/<station>_control.py
```

Minimum routes needed:
- `POST /connect` — calls `connection.connect()`
- `POST /disconnect` — calls `connection.disconnect()`
- `GET /connection-status` — returns `{"connected": bool}`
- `WebSocket /ws` — calls the broadcaster

### 3.4 Register in `main.py` and `config.py`

Add the new HOST/PORT to `backend/config.py` (Pydantic Settings), and add the IP to `backend/.env`.

### 3.5 Add a DB table for telemetry

See [Section 6](#6-adding-a-new-database-table).

---

## 4. Adding a New OPC-UA Tag

### 4.1 Discover available tags on a PLC

```powershell
# Browse all nodes on the ASRS PLC
backend\venv\Scripts\python.exe reference\scripts\discovery\discover_tags.py --host 10.10.14.104 --port 4840
```

This script recursively walks the OPC-UA address space and prints all readable nodes with their namespace index, node ID format, and data type.

### 4.2 Add to the station's tag map

```python
# In backend/stations/<station>/<station>_station.py

STATION_DATA_TAGS = {
    # Existing tags...
    "new_measurement": "ns=4, i=42",   # integer node ID
    # or
    "new_flag": "ns=4, s=MyDevice.Flag",  # string node ID
}
```

### 4.3 Read it in the broadcaster

```python
# In backend/websockets/<station>_broadcaster.py

async def _read_station_data(self) -> dict:
    data = {}
    for key, node_id in STATION_DATA_TAGS.items():
        node = self.connection.get_node(node_id)   # cached after first call
        data[key] = await asyncio.to_thread(node.get_value)
    return data
```

### 4.4 Add to the DB table (if logging)

Add a column to the corresponding telemetry table (see Section 6).

---

## 5. Adding a New Modbus Sensor

### 5.1 Probe the sensor's register map

```powershell
# Verbose probe — dumps raw register values
backend\venv\Scripts\python.exe reference\scripts\discovery\modbus_diagnostic.py --host 10.10.14.103 --verbose

# Probe specific unit ID
backend\venv\Scripts\python.exe reference\scripts\discovery\modbus_diagnostic.py --host 10.10.14.103 --unit-id 4
```

### 5.2 Identify the register layout

Look for sane float32 values using the word-swapped decode:
```python
import struct

def decode_float(reg_hi, reg_lo):
    """Word-swapped big-endian float32 (VibIT standard encoding)."""
    raw = struct.pack(">HH", reg_lo, reg_hi)  # swap word order
    return struct.unpack(">f", raw)[0]
```

### 5.3 Add a new `VibitModbusReader` instance

```python
# backend/stations/mirac/cnc_mirac_backend.py

from backend.communication.vibit_modbus import VibitModbusReader

# Add a new reader for unit 4
new_sensor = VibitModbusReader(
    host=settings.MIRAC_VIBIT_HOST,
    port=settings.MIRAC_VIBIT_PORT,
    unit_id=4,
    base_address=4000,
    register_type="input"  # FC4
)
```

### 5.4 Add to the broadcaster's Modbus poll loop

The VibIT gateway supports **only one TCP connection at a time**. Serialize reads with a 200 ms gap:

```python
# backend/websockets/mirac_broadcaster.py

async def _modbus_poll_loop(self):
    while True:
        u1_data = await asyncio.to_thread(self.vibit_u1.read_snapshot)
        await asyncio.sleep(0.2)   # ← 200ms gap mandatory
        u2_data = await asyncio.to_thread(self.vibit_u2.read_snapshot)
        await asyncio.sleep(0.2)
        u4_data = await asyncio.to_thread(self.new_sensor.read_snapshot)  # new
        
        self._modbus_cache.update({**u1_data, **u2_data, **u4_data})
        await asyncio.sleep(8)   # ← 8s poll interval (sensor update rate)
```

---

## 6. Adding a New Database Table

### 6.1 Edit the schema file

All schema changes go in `backend/database/Integrated_Schema_v2.sql`.

```sql
-- New sensor telemetry table template
CREATE TABLE IF NOT EXISTS new_sensor_data (
    -- Standard columns (copy these exactly for every telemetry table)
    time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    machine_id  TEXT NOT NULL REFERENCES machines(machine_id),
    sensor_id   UUID REFERENCES machine_sensors(sensor_id),
    
    -- Your sensor-specific columns
    measurement_1   FLOAT,
    measurement_2   FLOAT,
    
    -- Indexes for time-range queries
    CONSTRAINT fk_new_sensor_machine FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
);

CREATE INDEX IF NOT EXISTS idx_new_sensor_time ON new_sensor_data(machine_id, time DESC);
```

### 6.2 Apply the change to the database

**Development (running DB):**
```sql
-- Connect to the DB and run just the new CREATE TABLE statement
psql -U coedm -d coedm_db -c "CREATE TABLE IF NOT EXISTS new_sensor_data (...);"
```

**Fresh deployment:**
The full schema in `Integrated_Schema_v2.sql` uses `CREATE TABLE IF NOT EXISTS` everywhere — safe to re-run.

### 6.3 Write a DB insert function

```python
# In the broadcaster's _log_to_db method (or a new crud function)
async def _log_new_sensor(self, data: dict, sensor_id: str):
    def _write():
        with SessionLocal() as db:
            db.execute(text("""
                INSERT INTO new_sensor_data 
                    (time, machine_id, sensor_id, measurement_1, measurement_2)
                VALUES 
                    (:time, :machine_id, :sensor_id, :m1, :m2)
            """), {
                "time": ist_now(),
                "machine_id": "my_machine",
                "sensor_id": sensor_id,
                "m1": data.get("measurement_1"),
                "m2": data.get("measurement_2"),
            })
            db.commit()
    # Non-blocking: runs in thread pool
    await asyncio.to_thread(_write)
```

> **Key Rule:** Always use `asyncio.to_thread()` for DB writes. Never `await db.execute()` directly from the broadcaster loop — SQLAlchemy's synchronous engine blocks the event loop.

---

## 7. Adding a New Frontend Page

### 7.1 Create the page component

```
frontend/src/pages/<StationName>.jsx
frontend/src/pages/<StationName>.css   (optional)
```

**Minimum template for a WebSocket page:**

```jsx
// frontend/src/pages/MyStation.jsx
import { useState, useRef, useCallback, useEffect } from "react";
import { deepMerge } from "../utils/deepMerge";

const WS_URL = `${import.meta.env.VITE_WS_URL ?? "ws://localhost:8000"}/api/control/mystation/ws`;

export default function MyStation() {
  const [data, setData] = useState(null);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const dataRef = useRef(null);
  const wsRef = useRef(null);

  const connectWS = useCallback(() => {
    setWsStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("connected");

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "snapshot") {
        dataRef.current = msg.data;
        setData(msg.data);
      } else if (msg.type === "delta") {
        const merged = deepMerge(dataRef.current, msg.data);
        dataRef.current = merged;
        setData(merged);
      }
      // heartbeat: ignore
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
      setTimeout(() => connectWS(), 3000); // auto-reconnect in 3s
    };
  }, []);

  useEffect(() => {
    connectWS();
    return () => wsRef.current?.close();
  }, [connectWS]);

  return (
    <div className="page-container">
      <h1>My Station — {wsStatus}</h1>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}
```

### 7.2 Add the route in `App.jsx`

```jsx
// frontend/src/App.jsx
const MyStation = React.lazy(() => import("./pages/MyStation"));

// Inside <Routes>:
<Route path="/mystation" element={<MyStation />} />
```

### 7.3 Add to the bottom nav

The bottom navigation bar is in `App.jsx`. Add your route to the `navItems` array:

```jsx
const navItems = [
  // existing items...
  { path: "/mystation", label: "My Station", icon: "🔧" },
];
```

### 7.4 Design guidelines

Use these CSS classes from `industrial-ui.css`:

```css
.asm-hud-card           /* Data card with border */
.asm-val                /* Value container */
.asm-val__label         /* Uppercase label (13px, muted) */
.asm-val__num           /* Large monospace number (22px) */
.asm-val__unit          /* Unit suffix (12px, muted) */
.asm-hud-badge          /* Status badge (LIVE/OFFLINE) */
.asm-hud-badge--active  /* Green active badge */
```

Colours from `tokens.css`:
- `--primary: #F5CB5C` (amber gold — buttons, active states)
- `--bg-primary: #242423` (dark background)
- `--text-primary: #E8EDDF` (cream white)
- `--status-ok: #CFDBD5` / `--status-warn: #F5CB5C` / `--status-error: #ff6b6b`

---

## 8. Code Style & Conventions

### Python Backend

- **No ORM models**: Use raw `text()` queries with named parameters. Never use `db.query(Model)`.
- **Timestamps**: Always use `ist_now()` from `backend/core/timezone.py`. Never `datetime.utcnow()` or `datetime.now()`.
- **Non-blocking DB writes**: Always `asyncio.to_thread(_write)`. Never block the event loop.
- **OPC-UA node IDs**: Define them as constants in the station's `_station.py` file. Never hardcode inside the broadcaster.
- **Singleton connections**: Each station has exactly one `OPCUAConnection` object, created at module import time.
- **Logging**: Use `logging.getLogger(__name__)`. Set level via `LOG_LEVEL` in `.env`. Never `print()`.

### React Frontend

- **`dataRef` pattern**: Always keep a `useRef` mirror of state for WebSocket `onmessage` handlers to avoid stale closures.
- **`deepMerge` for deltas**: Never `Object.assign()` — it loses nested fields.
- **Lazy loading**: All pages must be `React.lazy()` imported in `App.jsx`.
- **`flushSync` for modals**: Use `flushSync(() => openModal("id"))` to prevent modal immediately closing.

### Database

- **Append-only tables**: Never `UPDATE` or `DELETE` from `storage_transactions`, `vibit_readings`, `machine_events`, or any telemetry table.
- **Trigger PKs**: Never manually set `storage_boxes.box_id` or `storage_compartments.compartment_id` — the PostgreSQL trigger computes them.

---

## 9. Running Tests

```powershell
# Run all 152 tests
backend\venv\Scripts\python.exe -m pytest backend\tests\ -q

# Run with verbose output
backend\venv\Scripts\python.exe -m pytest backend\tests\ -v

# Run a specific test file
backend\venv\Scripts\python.exe -m pytest backend\tests\test_asrs_crud.py -v

# Run tests matching a pattern
backend\venv\Scripts\python.exe -m pytest backend\tests\ -k "test_store" -v
```

Tests use `httpx.AsyncClient` with a test PostgreSQL database. The test database URL is configured in `backend/tests/conftest.py`.

---

## 10. Git Workflow

1. **Never push directly to `main`** — branch protection is enforced.

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/triac-vibration-integration
   ```

3. **Write tests** for any new backend code.

4. **Open a Pull Request** on GitHub.

5. **The CI pipeline** (`.github/workflows/ci.yml`) runs:
   - Python lint + type check
   - `pytest` against a temporary DB
   - React build check

6. **Merge** after CI passes and at least one review.

---

*CoEDM Smart Manufacturing Control — BVM Engineering College | July 2026*
