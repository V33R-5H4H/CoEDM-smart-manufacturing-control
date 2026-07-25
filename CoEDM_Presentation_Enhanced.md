# CoEDM Smart Manufacturing Control Software
## Centre of Excellence in Digital Manufacturing — BVM Engineering College, Anand

---

> **Project ID:** 2026.05.1 &nbsp;|&nbsp; **Version:** v4.3.0-CI-DEPLOYED &nbsp;|&nbsp; **Internship:** May 2026
>
> **Institution:** BVM Engineering College, Vallabh Vidyanagar, Anand 388120, Gujarat, India

---

## Table of Contents

| # | Section |
|---|---------|
| 1 | [Executive Summary](#1-executive-summary) |
| 2 | [Manufacturing Line Flow](#2-manufacturing-line-flow) |
| 3 | [System Architecture](#3-system-architecture) |
| 4 | [Communication Protocols](#4-communication-protocols) |
| 5 | [Technology Stack](#5-technology-stack) |
| 6 | [Station Modules — AS/RS](#6-station-modules--asrs) |
| 7 | [Station Modules — MIRAC CNC](#7-station-modules--mirac-cnc) |
| 8 | [Station Modules — TRIAC CNC](#8-station-modules--triac-cnc) |
| 9 | [Station Modules — Assembly Press](#9-station-modules--assembly-press) |
| 10 | [Station Modules — AMR Robot](#10-station-modules--amr-robot) |
| 11 | [Station Modules — TM Cobot](#11-station-modules--tm-cobot) |
| 12 | [Core Infrastructure](#12-core-infrastructure) |
| 13 | [Database Architecture](#13-database-architecture) |
| 14 | [Frontend Architecture](#14-frontend-architecture) |
| 15 | [E-Commerce Portal](#15-e-commerce-portal) |
| 16 | [API Reference](#16-api-reference) |
| 17 | [Deployment & DevOps](#17-deployment--devops) |
| 18 | [Key Engineering Decisions](#18-key-engineering-decisions) |
| 19 | [Project Metrics & Numbers](#19-project-metrics--numbers) |
| 20 | [Future Roadmap](#20-future-roadmap) |
| 21 | [Glossary](#21-glossary) |

---

## 1. Executive Summary

The **CoEDM Smart Manufacturing Control Software** is a full-stack industrial control platform that unifies 7 heterogeneous factory floor machines under a single browser-accessible HMI. Built during the May 2026 CoEDM Internship at BVM Engineering College, it replaces manual PLC terminal interactions with a centralized, real-time monitoring and control system.

### The Problem Before This System

```
Before                              After
──────────────────────────────────  ─────────────────────────────────────────
🚶 Walk to each PLC terminal        🌐 Browser HMI from any LAN device
📺 Siloed machine dashboards        🏭 Unified dashboard for all 7 stations
📂 No event/alarm persistence       🗄 PostgreSQL log with severity + timestamps
📋 Manual ASRS retrieval            🛒 E-commerce order → physical shuttle move
📊 Node-RED dashboards, no storage  📈 TimescaleDB hypertables for all sensors
🗺 No AMR software dispatch         🤖 Dispatch AMR via browser button click
⚠️ No centralized safety alerts     🔒 SafetyOverlay blocks all controls on fault
```

### Platform Capabilities at a Glance

| Metric | Value |
|--------|-------|
| Machines Integrated | **7** |
| Communication Protocols | **4** (OPC-UA · Modbus TCP · Raw TCP/TMSCT · WebSocket) |
| ASRS Storage Slots | **210** (35 bins × 6 subcompartments) |
| Live WebSocket Channels | **5** |
| REST API Endpoints | **40+** |
| Database Tables | **25+** |
| Frontend Pages | **9** (all lazy-loaded) |
| Docker Services | **4** |
| Largest Frontend File | **84 KB** (Triac.jsx & Assembly.jsx) |

---

## 2. Manufacturing Line Flow

The complete order-fulfillment path from customer purchase to physical product delivery:

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                  ORDER FULFILLMENT PIPELINE                        │
  └─────────────────────────────────────────────────────────────────────┘

  🛒 Customer Order         🗄️ AS/RS Retrieval       🤖 AMR Transfer
  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
  │  ecom portal │─ POST ──▶│ OPC-UA PLC   │─ disp. ─▶│ Modbus TCP   │
  │  JWT auth    │          │ shuttle moves│          │ navigate()   │
  └──────────────┘          └──────────────┘          └──────────────┘
                                                              │
                                                              ▼
  🔩 Assembly Press         🔍 Inspection             ✔/✘ Decision
  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐
  │ OPC-UA press │◀─ AMR ──│ Vision sys.  │◀─ AMR ──│ Accept →     │
  │ bearing/shaft│          │ (future Q3)  │          │ dispatch     │
  └──────────────┘          └──────────────┘          │ Reject →     │
                                                       │ CNC rework   │
  ⚙️ CNC Machining                                    └──────────────┘
  ┌─────────────────────────────────┐
  │ MIRAC (lathe) or TRIAC (mill)   │
  │ OPC-UA control + VibIT sensors  │
  └─────────────────────────────────┘
```

**Protocol mapping per step:**

| Step | Machine | Protocol | IP:Port |
|------|---------|----------|---------|
| Retrieval | AS/RS Shuttle | OPC-UA | 10.10.14.104:4840 |
| Transfer | AMR Robot | Modbus TCP | 10.10.14.122:502 |
| Assembly | Hydraulic Press | OPC-UA | 10.10.14.113:4840 |
| Machining | MIRAC CNC Lathe | OPC-UA + Modbus | 10.10.14.102 + 103 |
| Machining | TRIAC CNC Mill | OPC-UA + Modbus | 10.10.14.125 + 129 |
| Pick-place | TM Cobot | Raw TCP/TMSCT | 10.10.14.106:5890 |

---

## 3. System Architecture

### 3-Tier Platform Diagram

```
  ╔═══════════════════════════════════════════════════════════════════╗
  ║  TIER 1 — CLIENT BROWSER (Any device on factory LAN)            ║
  ║  ┌─────────────┐ ┌──────────────┐ ┌───────────┐ ┌───────────┐  ║
  ║  │ React 18 SPA│ │ Recharts SVG │ │WS Client  │ │Dark/Light │  ║
  ║  │ Vite build  │ │ Framer Motion│ │wsCache.js │ │Theme sys. │  ║
  ║  └─────────────┘ └──────────────┘ └───────────┘ └───────────┘  ║
  ╚═══════════════════════════╤═══════════════════════════════════════╝
                              │ HTTP REST + WebSocket
  ╔═══════════════════════════╧═══════════════════════════════════════╗
  ║  TIER 2 — FASTAPI BACKEND (Python 3.11 + uvicorn)               ║
  ║  ┌─────────────┐ ┌──────────────┐ ┌───────────┐ ┌───────────┐  ║
  ║  │ REST API    │ │ WS Broadcast │ │Alarm Mgr  │ │Workflow   │  ║
  ║  │ 40+ routes  │ │ 5 channels   │ │singleton  │ │Engine     │  ║
  ║  └─────────────┘ └──────────────┘ └───────────┘ └───────────┘  ║
  ║  ┌─────────────┐ ┌──────────────┐ ┌───────────┐ ┌───────────┐  ║
  ║  │ OPC-UA Drv  │ │VibitGateway  │ │JWT Auth   │ │orjson     │  ║
  ║  │ asyncua     │ │ pymodbus     │ │ecom users │ │serial.    │  ║
  ║  └─────────────┘ └──────────────┘ └───────────┘ └───────────┘  ║
  ╚═══════════════════════════╤═══════════════════════════════════════╝
                              │ SQLAlchemy ORM
  ╔═══════════════════════════╧═══════════════════════════════════════╗
  ║  TIER 3 — DATA LAYER                                            ║
  ║  ┌──────────────────────────┐  ┌────────────────────────────┐   ║
  ║  │ PostgreSQL 15            │  │ TimescaleDB Extension      │   ║
  ║  │ 25+ tables, ACID txns    │  │ Hypertables: vibit_readings │   ║
  ║  │ SQLAlchemy + Alembic     │  │ mirac/triac_sensor_data    │   ║
  ║  └──────────────────────────┘  └────────────────────────────┘   ║
  ╚═══════════════════════════╤═══════════════════════════════════════╝
                              │ OPC-UA / Modbus TCP / Raw TCP
  ╔═══════════════════════════╧═══════════════════════════════════════╗
  ║  FACTORY FLOOR — Physical Hardware                              ║
  ║  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────┐  ║
  ║  │ AS/RS    │ │MIRAC CNC │ │TRIAC CNC │ │Assembly│ │ AMR   │  ║
  ║  │104:4840  │ │102:4840  │ │125:4840  │ │113:4840│ │122:502│  ║
  ║  │ OPC-UA   │ │OPC+Modbus│ │OPC+Modbus│ │ OPC-UA │ │Modbus │  ║
  ║  └──────────┘ └──────────┘ └──────────┘ └────────┘ └───────┘  ║
  ║  ┌──────────┐                                                   ║
  ║  │ TM Cobot │                                                   ║
  ║  │106:5890  │                                                   ║
  ║  │ Raw TCP  │                                                   ║
  ║  └──────────┘                                                   ║
  ╚═══════════════════════════════════════════════════════════════════╝
```

---

## 4. Communication Protocols

### 4.1 OPC-UA (Open Platform Communications — Unified Architecture)

**Machines:** AS/RS · MIRAC CNC · TRIAC CNC · Assembly Press  
**Library:** `asyncua.sync.Client` (thread-safe sync wrapper)

```
OPC-UA Features Used:
├── Tag Read/Write        → Remote machine variable access
├── Change Subscriptions  → Real-time LED occupancy events (AS/RS)
├── Pulse Commands        → 500ms write for Cycle Start/Stop/Reset
└── Health Monitor        → Daemon thread reads ns=0;i=2259 every 5s
                           Auto-reconnect + subscriber callback fire
```

**Session lifecycle:**
```python
# opcua_driver.py — OPCUAConnection class
class OPCUAConnection:
    _lock = threading.Lock()
    _node_cache: Dict[str, Node] = {}

    def connect(self):
        # LAZY — only called on first API request
        # Never blocks FastAPI startup
        with self._lock:
            self._client.connect()
            self._start_health_monitor()  # daemon thread

    def _health_monitor(self):
        while self._running:
            time.sleep(5)
            try:
                self._client.get_node("ns=0;i=2259").get_value()
            except Exception:
                self._reconnect()   # clears node cache, fires callbacks
```

### 4.2 Modbus TCP

**Machines:** AMR Robot (dispatch) · VibIT sensors on MIRAC & TRIAC  
**Library:** `pymodbus 3.x`

```
Modbus Register Layout (VibIT Sensors):
┌─────────────────────────────────────────────────┐
│  Register  │ Data Type  │ Meaning               │
├────────────┼────────────┼───────────────────────┤
│ 4000-4001  │ float32    │ Spindle RMS amplitude  │
│ 4002-4003  │ float32    │ Spindle peak frequency │
│ 4004-4005  │ float32    │ Tool holder RMS        │
│ 4006-4007  │ float32    │ Tool holder peak freq. │
│ 4008-4009  │ float32    │ Axes vibration RMS     │
│ 4010-4011  │ float32    │ Axes peak frequency    │
└─────────────────────────────────────────────────┘
Word-swap order: big-endian bytes, swapped words (Modicon float)
```

**Critical design — VibitGateway singleton:**
```python
# vibit_modbus.py
class VibitGateway:
    _registry: Dict[Tuple[str,int], 'VibitGateway'] = {}
    _lock = threading.RLock()

    @classmethod
    def get(cls, host: str, port: int) -> 'VibitGateway':
        with cls._lock:
            key = (host, port)
            if key not in cls._registry:
                cls._registry[key] = cls(host, port)
            return cls._registry[key]
    
    # ONE ModbusTcpClient shared across all unit IDs on same IP
    # RLock serialises concurrent read_float() calls
    # Prevents "connection refused" from VibIT gateway hardware limit
```

### 4.3 Raw TCP / TMSCT (Techman Robot)

**Machine:** TM Collaborative Robot  
**Connection:** `socket.socket(AF_INET, SOCK_STREAM)` → port 5890

```
TMSCT Packet Format:
$TMSCT,<len>,<id>,<script>,*<XOR_checksum>\r\n

Example — trigger sequence ID 3:
$TMSCT,18,1,SceneChangeStop(3),*42\r\n
         ↑   ↑  ↑                ↑
        len  id  TM Script       XOR of bytes after $ before *

XOR Checksum:
chk = 0
for byte in packet_bytes[1:]:  # skip leading '$'
    if byte == ord('*'): break
    chk ^= byte
checksum_hex = f"{chk:02X}"
```

### 4.4 WebSocket — Delta Protocol

**All 5 channels use the same 3-message-type protocol:**

```
                    WebSocket Lifecycle
                    ═══════════════════
                    
  Client connects   ─────────▶  SERVER sends: {"type": "snapshot", "data": {...full_state}}
  
  Next poll cycle   ◀─────────  SERVER sends: {"type": "delta", "data": {...only_changed_fields}}
  (if data changed)
  
  No data changed   ◀─────────  SERVER sends: {"type": "heartbeat"}
  
  ─────────────────────────────────────────────────────────────────
  
  Browser side (wsCache.js + deepMerge):
  
  if (msg.type === "snapshot") state = msg.data;
  else if (msg.type === "delta") state = deepMerge(state, msg.data);
  // heartbeat: no-op, just prevents timeout disconnection
  
  Result: ~80% bandwidth reduction on stable factory telemetry
```

---

## 5. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Backend** | Python + FastAPI | 3.11 + 0.115 | Async-native, auto OpenAPI docs, dependency injection, type hints |
| **Database** | PostgreSQL + TimescaleDB | 15 + 2.x | ACID for inventory integrity, hypertables for millions of sensor rows |
| **ORM** | SQLAlchemy + Alembic | 2.0 | Type-safe queries, session lifecycle, schema version control |
| **Frontend** | React + Vite + TailwindCSS | 18 + 5.x | Component model, lazy-loading, fast HMR, CSS custom property design |
| **Charts** | Recharts | 2.x | Declarative SVG for vibration time-series and displacement plots |
| **Animation** | Framer Motion + rAF + spring | — | 60fps machine SVG bypassing React reconciler with physics model |
| **Serialization** | orjson | 3.x | 5–10× faster than stdlib json on hot WS paths; datetime natively |
| **OPC-UA Client** | asyncua (sync wrapper) | 1.x | Thread-safe PLC communication, health monitoring, auto-reconnect |
| **Modbus Client** | pymodbus | 3.x | Shared VibitGateway, float register reads, AMR dispatch |
| **Web Server** | uvicorn | — | ASGI server, asyncio event loop, production-grade |
| **HTTP Client** | httpx + pytest | — | Async integration tests matching FastAPI runtime |
| **Deployment** | Docker Compose | — | Reproducible 4-service production stack |

---

## 6. Station Modules — AS/RS

> **Automated Storage and Retrieval System**  
> **Protocol:** OPC-UA | **Address:** `opc.tcp://10.10.14.104:4840`

### Physical Layout

```
  ASRS Storage Rack — 5 Columns × 7 Rows = 35 Bins
  Each bin has 6 subcompartments = 210 total slots
  
       Col A    Col B    Col C    Col D    Col E
      ┌──────┬──────┬──────┬──────┬──────┐
  R1  │  A1  │  B1  │  C1  │  D1  │  E1  │
      │ ████ │      │ ████ │ ████ │      │  ████ = Occupied (OPC-UA LED: GREEN)
      ├──────┼──────┼──────┼──────┼──────┤        empty  = Available  (LED: RED)
  R2  │  A2  │  B2  │  C2  │  D2  │  E2  │
      │      │ ████ │ ████ │      │ ████ │
      ├──────┼──────┼──────┼──────┼──────┤
  R3  │  A3  │  B3  │ [C3] │  D3  │  E3  │  [C3] = Shuttle currently at this bin
      │ ████ │ ████ │ →◉←  │ ████ │      │        (animated in browser HMI)
      ├──────┼──────┼──────┼──────┼──────┤
      │  ... │  ... │  ... │  ... │  ... │
      └──────┴──────┴──────┴──────┴──────┘
  
  Drop-off zone: designated handoff position for AMR transfers
  Safety curtain: triggers critical alarm on interruption
```

### DB-First Algorithm

```python
# asrs_logic.py — The fundamental safety guarantee
def store_to_asrs(box_id: str, sub_id: str, item_id: str) -> dict:
    with SessionLocal() as session:
        # Step 1: Validate — 404 if any input doesn't exist
        item = session.get(StorageItem, item_id)
        box  = session.get(Box, box_id)
        sub  = session.get(Subcompartment, sub_id)
        
        # Step 2: Check occupancy
        if sub.is_occupied:
            raise HTTPException(409, "Subcompartment already occupied")
        
        # Step 3: Send PLC command first (side-effect)
        plc_result = send_plc_command(f"{box_id}{sub_id}S")
        
        # Step 4: Only commit DB on PLC success
        if plc_result["success"]:
            sub.is_occupied = True
            sub.item_id = item_id
            log_transaction(session, "STORE", box_id, sub_id, item_id)
            session.commit()   # ← ONLY committed here
        
        # PLC failure → session.rollback() automatically on context exit
        return {"plc": plc_result, "db": plc_result["success"]}
```

### WebSocket Events Emitted

| Event | Trigger | Data |
|-------|---------|------|
| `led_update` | OPC-UA change subscription fires | `{bin_id, led_color}` |
| `shuttle_position` | Polling cycle (1Hz) | `{x, y, target_bin}` |
| `ecom_order` | New customer order placed | `{order_id, product, bin_id}` |
| `safety_curtain` | GVL.Curtain = True | `{severity: "critical", machine: "asrs"}` |

---

## 7. Station Modules — MIRAC CNC

> **MIRAC CNC Lathe Machine**  
> **OPC-UA:** `opc.tcp://10.10.14.102:4840`  
> **VibIT Modbus:** `10.10.14.103:502` (Unit IDs: 1, 2, 3)

### OPC-UA Tag Map

```
Namespace: ns=2
├── GVL
│   ├── SpindleRPM         → float32  — live spindle speed (RPM)
│   ├── SpindleTemp        → float32  — temperature (°C)
│   ├── ToolNumber         → int16    — current tool position
│   ├── AxisX              → float32  — X-axis position (mm)
│   ├── AxisZ              → float32  — Z-axis position (mm)
│   ├── LED_A1 ... LED_E7  → bool     — bin occupancy LEDs
│   ├── Buzzer             → bool     — alarm state
│   └── CycleState         → int16    — 0=idle, 1=running, 2=alarm
└── PLC_Control
    ├── CycleStart         → bool (500ms pulse write)
    ├── CycleStop          → bool (500ms pulse write)
    └── Reset              → bool (500ms pulse write)
```

### VibIT Vibration Sensors (3 Units)

```
Vibration Telemetry — Simulated live waveform:

  Amplitude (g)
  0.10 │     ╭──╮         ╭──╮         ╭──╮
       │    ╱    ╲       ╱    ╲       ╱    ╲
  0.05 │   ╱      ╲     ╱      ╲     ╱      ╲
       │──╱──────────╲─╱──────────╲─╱──────────╲──
  0.00 └────────────────────────────────────────────▶ time
       
  ← Spindle bearing (Unit 1)  ·  Tool holder (Unit 2)  ·  Axes (Unit 3)
  
  Normal range: 0.01–0.05 g RMS
  Warning: > 0.08 g  →  orange status
  Critical: > 0.15 g  →  alarm + WS broadcast
```

### Spring-Physics 60fps Animation Model

```javascript
// mirac_animator.js — runs outside React render cycle
function springStep(current, target, velocity, dt) {
    const omega = 2 * Math.PI * 2.0;  // natural freq = 2 Hz
    const zeta  = 1.0;                 // critically damped (no overshoot)
    const acc = omega*omega*(target - current) - 2*zeta*omega*velocity;
    const newVel = velocity + acc * dt;
    const newPos = current + newVel * dt;
    return { pos: newPos, vel: newVel };
}

// Called at 60fps via requestAnimationFrame
// Interpolates 1–2 Hz OPC-UA updates to smooth 60fps SVG motion
// Zero React re-renders — direct setAttribute on SVG elements
```

---

## 8. Station Modules — TRIAC CNC

> **TRIAC CNC Vertical Milling Machine**  
> **OPC-UA:** `opc.tcp://10.10.14.125:4840`  
> **VibIT Modbus:** `10.10.14.129:502` (Unit IDs: 1, 2, 3)

TRIAC mirrors the MIRAC architecture exactly but serves a vertical milling machine:

| Aspect | MIRAC | TRIAC |
|--------|-------|-------|
| Machine type | CNC Lathe | CNC Vertical Mill |
| OPC-UA IP | 10.10.14.102 | 10.10.14.125 |
| VibIT Modbus IP | 10.10.14.103 | 10.10.14.129 |
| Axes | X/Z (lathe) | X/Y/Z (mill) |
| Frontend file | Mirac.jsx — 72 KB | **Triac.jsx — 84 KB** (largest) |
| Broadcaster | mirac_broadcaster.py | triac_broadcaster.py |
| VibIT units | 3 sensors | 3 sensors |
| Delta WS | ✓ | ✓ |
| 60fps spring SVG | ✓ | ✓ |

---

## 9. Station Modules — Assembly Press

> **Hydraulic Assembly Press**  
> **Protocol:** OPC-UA | **Address:** `opc.tcp://10.10.14.113:4840`

### OPC-UA Control Tags

```
┌────────────────────────────────────────────────────────┐
│  Assembly Press Control Interface                      │
│                                                        │
│  Commands (OPC-UA write → pulse)                       │
│  ├── BEARING_ON     → Press-fit bearing                │
│  ├── SHAFT_ON       → Press-fit shaft                  │
│  ├── VICE_OPEN      → Release workpiece                │
│  └── VICE_CLOSE     → Clamp workpiece                  │
│                                                        │
│  ⚠️  INTERLOCK: BEARING and SHAFT are mutually         │
│      exclusive — only one may be active at a time.     │
│      Backend enforces this at API level.               │
│                                                        │
│  Monitoring Tags                                       │
│  ├── GVL.mm         → float32  piston displacement     │
│  ├── GVL.Buzzer     → bool     alarm / safety curtain  │
│  └── GVL.CycleState → int16    press cycle status      │
└────────────────────────────────────────────────────────┘
```

### Displacement Visualization

```
Frontend: Assembly.jsx — dual canvas rendering

  Raw signal canvas:
  ████░░░░████░░░░████░░  (raw OPC-UA displacement values)

  Filtered canvas:
  ────────────────────  (critically-damped spring filter)
  
  Recharts scrolling plot:
  │                           ╭────╮
  │                    ╭─────╯    ╰──────╮
  │─────────────╭─────╯                  ╰─────────────
  │
  └─────────────────────────────────────────────── time →
```

---

## 10. Station Modules — AMR Robot

> **Autonomous Mobile Robot**  
> **Protocol:** Modbus TCP | **Address:** `10.10.14.122:502`

### Station Layout & Navigation

```
  Factory Floor Map — 7 Named Stations
  
  ┌─────────────────────────────────────────────────────┐
  │                                                     │
  │  [ASRS]         [INSPECTION]    [TESTING]           │
  │   (0.5, 2.1)     (3.2, 2.1)     (5.8, 2.1)         │
  │                                                     │
  │        [MIRAC]        ⊙ HOME        [TRIAC]         │
  │        (1.5, 4.5)   (3.5, 4.0)    (5.5, 4.5)       │
  │                                                     │
  │             [ASSEMBLY]                              │
  │              (3.0, 6.2)                             │
  │                                                     │
  │  ⊙ = Current AMR position (live X/Y from Modbus)   │
  │  ─ = Trail polyline (rolling 40-point history)      │
  └─────────────────────────────────────────────────────┘
```

### Station Detection Algorithm

```python
# amr_controller.py — proximity detection
STATIONS = {
    "ASRS":       (0.5,  2.1),
    "MIRAC":      (1.5,  4.5),
    "TRIAC":      (5.5,  4.5),
    "ASSEMBLY":   (3.0,  6.2),
    "HOME":       (3.5,  4.0),
    "TESTING":    (5.8,  2.1),
    "INSPECTION": (3.2,  2.1),
}
THRESHOLD = 0.25  # metres

def get_station_name(x: float, y: float) -> str:
    for name, (sx, sy) in STATIONS.items():
        if math.hypot(x - sx, y - sy) < THRESHOLD:
            return name
    # In transit: inverse-distance weighted interpolation
    return _interpolate_nearest(x, y)
```

### Design Decision — Manual Connect Mode

```
The AMR TCP session is intentionally NOT opened at server startup.

Reason: The robot is frequently powered off when not in use.
Result: Rest of system (ASRS, CNC, Assembly) starts normally
        even if AMR is physically off.

Startup behavior:
  ├── AMR: connection = None (no TCP attempt)
  └── All other stations: lazy OPC-UA connect on first API call

AMR reconnect: Manual button in browser → 3 retry attempts
               with 1-second backoff between each.
```

---

## 11. Station Modules — TM Cobot

> **Techman TM Collaborative Robot**  
> **Protocol:** Raw TCP / TMSCT | **Address:** `10.10.14.106:5890`

### TMSCT Protocol Detail

```
Techman Script Communication (TMSCT) Packet:

$TMSCT,<data_length>,<script_id>,<tm_script>,*<XOR_checksum>\r\n

Fields:
  $         → Start-of-packet marker
  TMSCT     → Protocol identifier
  data_length  → Number of characters between the second comma and *
  script_id    → Incrementing transaction ID (1, 2, 3...)
  tm_script    → Valid TM Script language command
  *         → Checksum marker
  XOR       → XOR of all bytes from char after $ to char before *
  \r\n      → CRLF packet terminator

Examples:
  $TMSCT,18,1,SceneChangeStop(3),*42\r\n   ← trigger sequence 3
  $TMSCT,6,2,Stop(),*40\r\n                 ← emergency stop

XOR Checksum Implementation:
  def calc_xor(packet: str) -> str:
      chk = 0
      for char in packet[1:]:  # skip leading '$'
          if char == '*': break
          chk ^= ord(char)
      return f"{chk:02X}"
```

### Robot Integration Model

```
  Backend API call         TM Robot internal flow
  ─────────────────        ──────────────────────
  
  POST /api/control/       ┌──────────────────────────────┐
  cobot/trigger            │  TM Flow Program             │
       │                   │                              │
       ▼                   │  [Start] ──▶ [Task nodes]    │
  Open TCP socket          │                              │
  Build TMSCT packet  ──▶  │  [Listen Node] ←── waiting   │
  Send packet         ──▶  │       │                      │
                           │  Receives TMSCT script  ──▶  │
  Wait for ACK       ◀──   │  Execute TM Script           │
  Close socket             │       │                      │
                           │  [Pick-and-place sequence]   │
                           └──────────────────────────────┘
```

---

## 12. Core Infrastructure

### 12.1 OPC-UA Connection Manager

```python
# opcua_driver.py — Complete session lifecycle

class OPCUAConnection:
    """Thread-safe singleton wrapper per machine IP."""
    _instance: Optional['OPCUAConnection'] = None
    _lock = threading.Lock()
    _node_cache: Dict[str, Node] = {}

    def connect(self) -> bool:
        """Lazy connection — only on first API call."""
        with self._lock:
            self._client = Client(self.url)
            self._client.connect()
            self._start_health_monitor()
            return True

    def _health_monitor(self):
        """Daemon thread: 5s interval health check."""
        while self._running:
            time.sleep(5)
            try:
                # ServerStatus node — always readable if server alive
                self._client.get_node("ns=0;i=2259").get_value()
            except Exception:
                self._handle_disconnect()

    def _handle_disconnect(self):
        self._node_cache.clear()   # invalidate cached node objects
        for cb in self._reconnect_callbacks:
            cb()                   # notify subscribers (e.g., WS broadcaster)
        self._reconnect()

    def write_bool_pulse(self, node_id: str, duration: float = 0.5):
        """Write True, wait duration, write False — for PLC triggers."""
        node = self._get_node(node_id)   # from cache if available
        node.set_value(True)
        time.sleep(duration)
        node.set_value(False)
```

### 12.2 WebSocket Delta Broadcaster

```python
# Base pattern used by all 5 WS broadcasters

class StationBroadcaster:
    def __init__(self):
        self._clients: List[WebSocket] = []
        self._last_broadcast: dict = {}

    async def broadcast_loop(self):
        while True:
            current = await self._poll_station()
            delta = deep_diff(self._last_broadcast, current)

            if delta:
                msg = orjson.dumps({"type": "delta", "data": delta})
                self._last_broadcast = current
            else:
                msg = orjson.dumps({"type": "heartbeat"})

            await asyncio.gather(*[ws.send_bytes(msg) for ws in self._clients])
            await asyncio.sleep(self.POLL_INTERVAL)

    async def handle_connection(self, ws: WebSocket):
        await ws.accept()
        # New client receives FULL state immediately
        snapshot = orjson.dumps({"type": "snapshot", "data": self._last_broadcast})
        await ws.send_bytes(snapshot)
        self._clients.append(ws)
```

### 12.3 Alarm Manager — Singleton Pattern

```
Alarm Lifecycle:
═════════════════

Machine fault detected (e.g., safety curtain, OPC-UA disconnect)
     │
     ▼
AlarmManager.raise_alarm(machine_id, title, severity)
     │
     ├── 1. INSERT INTO machine_events (DB persistent record)
     ├── 2. active_alarms.append(alarm)    (in-memory list)
     ├── 3. Fire WebSocket callbacks       (all connected browsers notified)
     └── 4. SafetyOverlay activates in React (blocks all controls)

On server restart:
     AlarmManager.__init__() reads active alarms from DB
     → system recovers persistent alarm state automatically
```

---

## 13. Database Architecture

### 13.1 Entity Relationship Overview

```
  machines (root)
  ├── machine_sensors          [1:N] → sensor config per machine
  ├── machine_connections      [1:N] → connection events log
  └── machine_events           [1:N] → fault/alarm history

  storage_items
  └── subcompartments          [1:N] → 6 per bin, 210 total
       └── storage_transactions [1:N] → every store/retrieve action
  
  retrieval_queue              → pending ASRS retrievals (priority-ordered)

  ecom_users
  └── orders                   [1:N] → customer purchase records
       └── order_items         [1:N] → line items per order

  workflows
  └── workflow_steps           [1:N] → ordered step sequence

  ─── TimescaleDB Hypertables ───────────────────────────────────
  vibit_readings               [partitioned by time]
  mirac_sensor_data            [partitioned by time]
  triac_sensor_data            [partitioned by time]
```

### 13.2 TimescaleDB Hypertables

```sql
-- TimescaleDB enables time-series optimization
SELECT create_hypertable('vibit_readings', 'timestamp',
    chunk_time_interval => INTERVAL '1 day'
);

-- Result: automatic time-partitioned chunks
-- Sub-second queries over millions of rows:
SELECT avg(rms_amplitude), date_trunc('minute', timestamp)
FROM vibit_readings
WHERE machine_id = 'mirac' 
  AND timestamp > NOW() - INTERVAL '2 hours'
GROUP BY 2
ORDER BY 2;

-- Future: Continuous Aggregate for hourly trends (no full scan)
CREATE MATERIALIZED VIEW vibit_hourly_avg
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', timestamp) AS bucket,
       machine_id,
       avg(rms_amplitude) AS avg_rms
FROM vibit_readings
GROUP BY 1, 2;
```

### 13.3 Key Table Schemas

```sql
-- Machine events (alarm log)
CREATE TABLE machine_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_id  VARCHAR(50) REFERENCES machines(id),
    title       TEXT NOT NULL,
    description TEXT,
    severity    VARCHAR(20) CHECK (severity IN ('info','warning','critical')),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,           -- NULL = still active
    resolved_by VARCHAR(100)
);

-- ASRS subcompartments
CREATE TABLE subcompartments (
    id          VARCHAR(20) PRIMARY KEY,  -- e.g., "A1_sub1"
    bin_id      VARCHAR(10) REFERENCES bins(id),
    is_occupied BOOLEAN DEFAULT FALSE,
    item_id     UUID REFERENCES storage_items(id),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Retrieval queue
CREATE TABLE retrieval_queue (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID REFERENCES storage_items(id),
    order_id    UUID REFERENCES orders(id),
    priority    INT DEFAULT 1,  -- 3 = high (ecom orders)
    status      VARCHAR(20) DEFAULT 'pending',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    started_at  TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
```

---

## 14. Frontend Architecture

### 14.1 Page Structure

```
src/
├── App.jsx                  ← Router + lazy imports + WS setup
├── pages/
│   ├── Dashboard.jsx        ← Factory overview, all station cards
│   ├── ASRS.jsx             ← 35-bin grid + operations + tutorial
│   ├── Mirac.jsx            ← CNC lathe HMI (72 KB)
│   ├── Triac.jsx            ← CNC mill HMI (84 KB, largest)
│   ├── Assembly.jsx         ← Hydraulic press HMI (84 KB)
│   ├── AMR.jsx              ← SVG floor map + dispatch
│   ├── Cobot.jsx            ← TMSCT trigger + status
│   ├── Inspection.jsx       ← Placeholder (future)
│   └── Testing.jsx          ← Placeholder (future)
├── components/
│   ├── FactoryLayout.jsx    ← Base layout wrapper
│   ├── StationEmoticon.jsx  ← Status icon per machine
│   ├── SafetyOverlay.jsx    ← Global fault lockout UI
│   ├── MiracMachineView.jsx ← Shared SVG CNC schematic
│   ├── DraggableHUD.jsx     ← Moveable heads-up display
│   ├── TutorialOverlay.jsx  ← Step-through guided tour
│   ├── ThemeToggle.jsx      ← Dark/light theme switch
│   └── ErrorBoundary.jsx    ← React error catch + friendly UI
└── utils/
    ├── wsCache.js           ← Global in-memory WS state store
    └── deepMerge.js         ← Client-side delta merge utility
```

### 14.2 Performance Architecture

```
Request flow for a page visit (e.g., /mirac):

  1. Browser requests /mirac
  2. React.lazy() loads Mirac.jsx chunk (only if not yet loaded)
  3. Suspense shows spinner during chunk load
  4. wsCache.js provides last-known telemetry immediately → no blank screen
  5. WebSocket connects → snapshot message arrives → UI fully populated
  6. Delta messages update only changed fields → minimal re-renders

  60fps animation loop (running parallel):
  requestAnimationFrame ──▶ read OPC-UA data from wsCache
                       ──▶ spring physics step (dt = frame time)
                       ──▶ directly set SVG attr (no React)
                       ──▶ schedule next frame
```

### 14.3 Tutorial System

```javascript
// TutorialOverlay.jsx — guided interactive tours
const ASRS_TUTORIAL_STEPS = [
  {
    target: '#asrs-grid',
    title: '35-Bin Storage Grid',
    text: 'Each cell represents a physical storage bin. Green = occupied, Red = empty.',
    position: 'right',
    waitForClick: false,    // auto-advance
  },
  {
    target: '#shuttle-track',
    title: 'Live Shuttle Tracker',
    text: 'The animated dot shows real-time shuttle X/Y position via OPC-UA.',
    position: 'bottom',
    waitForClick: true,     // must click "Next" to continue
  },
  // ... 6 more steps
];
// advanceRef.current() can be called from outside to trigger next step
// Used for automated demos or on-success advancement
```

---

## 15. E-Commerce Portal

### Complete Order Flow

```
  Customer Browser (:81)          Backend FastAPI (:8000)        Factory Floor
  ────────────────────────        ──────────────────────────     ─────────────
  
  1. POST /api/ecom/auth/login
     { email, password }    ──▶  Verify bcrypt hash
                            ◀──  { access_token: JWT }
  
  2. GET /api/ecom/products
                            ──▶  SELECT from storage_items
                            ◀──  [{ id, name, price, stock }]
  
  3. POST /api/ecom/orders
     { items: [{id, qty}] }
     Authorization: Bearer <JWT>
                            ──▶  1. get_current_ecom_user(token)
                                 2. Validate stock in subcompartments
                                 3. Create order + order_items rows
                                 4. Create retrieval_queue entry
                                    (priority=3, status="pending")
                                 5. asrs_logic.retrieve_product_with_asrs()
                                    └─▶ OPC-UA PLC command sent
                                        ┌──────────────────────────┐
                                        │  ASRS SHUTTLE MOVES 🏭   │
                                        └──────────────────────────┘
                                    └─▶ DB committed on success
                                    └─▶ WS broadcast: "ecom_order"
                            ◀──  { order_id, status: "processing" }
```

---

## 16. API Reference

### Control APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/control/asrs/connect` | Establish OPC-UA session to ASRS PLC |
| `POST` | `/api/control/asrs/store` | Store item at specific bin/subcompartment |
| `POST` | `/api/control/asrs/retrieve` | Retrieve item from bin/subcompartment |
| `POST` | `/api/control/asrs/retrieve-product` | E-commerce triggered retrieval |
| `WS` | `/api/control/asrs/ws/led-status` | Live LED + shuttle + ecom events |
| `POST` | `/api/control/mirac/connect` | Connect to MIRAC OPC-UA + VibIT Modbus |
| `POST` | `/api/control/mirac/command` | Send Cycle Start/Stop/Reset |
| `WS` | `/api/control/mirac/ws/vibit-data` | MIRAC telemetry + 3 VibIT sensors |
| `POST` | `/api/control/triac/connect` | Connect to TRIAC OPC-UA + VibIT Modbus |
| `WS` | `/api/control/triac/ws/vibit-data` | TRIAC telemetry + 3 VibIT sensors |
| `POST` | `/api/control/assembly/command` | Send BEARING_ON/SHAFT_ON/VICE_OPEN/CLOSE |
| `WS` | `/api/control/assembly/ws/hydraulic-data` | Assembly displacement + safety live |
| `POST` | `/api/control/amr/connect` | Open Modbus TCP to AMR |
| `POST` | `/api/control/amr/dispatch` | Navigate AMR to named station |
| `WS` | `/api/control/amr/ws` | AMR live X/Y position + station |
| `POST` | `/api/control/cobot/trigger` | Send TMSCT script to TM robot |

### Data APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/data/events` | Machine event log (filterable by machine, severity) |
| `POST` | `/api/data/events` | Manual event creation |
| `GET` | `/api/data/events/connections` | Connection state history |
| `GET` | `/api/data/machines` | All machine configurations |
| `GET` | `/api/data/telemetry` | Latest telemetry snapshot |
| `GET` | `/api/health` | System health status |

---

## 17. Deployment & DevOps

### Docker Compose Services

```yaml
# docker-compose.yml — simplified structure

services:

  db:
    image: timescale/timescaledb:latest-pg16
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10

  backend:
    build: ./backend
    ports: ["8000:8000"]
    command: >
      sh -c "alembic upgrade head &&
             uvicorn backend.api.main:app --host 0.0.0.0 --port 8000"
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]

  frontend:
    build: ./frontend       # Vite build → nginx serve
    ports: ["3000:80"]
    depends_on:
      backend:
        condition: service_healthy

  ecom:
    build: ./ecom           # Vite build → nginx serve
    ports: ["81:80"]
    depends_on:
      backend:
        condition: service_healthy
```

### Startup Sequence

```
docker compose up

  [1/4] db container starts
        → PostgreSQL 16 initializes
        → TimescaleDB extension loads
        → pg_isready health check passes ✓

  [2/4] backend container starts
        → alembic upgrade head (runs all migrations)
        → uvicorn starts on :8000
        → /api/health returns 200 ✓

  [3/4] frontend container starts
        → nginx serves Vite build on :3000

  [4/4] ecom container starts
        → nginx serves ecom Vite build on :81

Total cold start: ~30-45 seconds
```

### Local Development (Windows)

```
# No Docker needed for development
# Windows-native process managers

python start.py    → starts uvicorn (port 8000) + Vite dev server (port 5173)
                    → writes PID files for each process

python stop.py     → reads PID files, gracefully terminates all processes
```

---

## 18. Key Engineering Decisions

### Decision 01 — Database-First ASRS Logic

| | |
|---|---|
| **Problem** | If the PLC command fails after the DB is committed, inventory state is wrong (machine moved but DB says it didn't, or vice versa) |
| **Solution** | DB transaction is committed only after PLC command succeeds. PLC failure → DB rollback automatically via SQLAlchemy session context manager |
| **File** | `asrs_logic.py` |
| **Trade-off** | Slightly slower (DB write then PLC wait) but maintains perfect consistency |

### Decision 02 — Shared Modbus Gateway Client

| | |
|---|---|
| **Problem** | VibIT hardware only allows 1 TCP connection per gateway IP. Multiple simultaneous sensor reads would fail |
| **Solution** | `VibitGateway` class-level registry keyed by `(host, port)` — all readers share one `ModbusTcpClient` per IP. `RLock` serialises concurrent reads |
| **File** | `vibit_modbus.py` |
| **Trade-off** | Sequential reads (can't truly parallel) but prevents connection refused errors |

### Decision 03 — 60fps Animation Without React

| | |
|---|---|
| **Problem** | OPC-UA data arrives at 1–2 Hz. React re-renders at that rate produce jerky, unsmooth machine animations |
| **Solution** | `requestAnimationFrame` loop reads telemetry from `wsCache.js` ref, applies spring-physics interpolation, writes SVG `transform` attributes directly bypassing React's reconciler |
| **Files** | `Mirac.jsx`, `Triac.jsx`, `Assembly.jsx` |
| **Trade-off** | More complex code but true 60fps silky motion for machine visuals |

### Decision 04 — Delta-Only WebSocket Protocol

| | |
|---|---|
| **Problem** | Full state broadcast every cycle is wasteful — most telemetry fields don't change between polls |
| **Solution** | Server computes `deep_diff(last_broadcast, current)` and only transmits changed fields. New clients get snapshot. Idle periods send heartbeat |
| **Result** | ~80% bandwidth reduction. Browser deepMerge() has O(changed_fields) cost instead of O(total_fields) |
| **Files** | `delta.py`, `wsCache.js` |

### Decision 05 — Lazy OPC-UA Connections

| | |
|---|---|
| **Problem** | Connecting to 4 OPC-UA machines at startup blocks FastAPI boot and fails hard if any machine is offline |
| **Solution** | Connections established on first API call via lazy-init pattern. Health monitor starts after connect |
| **Result** | FastAPI starts in <1s regardless of machine state. Operators connect machines individually via browser buttons |
| **Files** | `opcua_driver.py` |

### Decision 06 — Manual AMR Connection Mode

| | |
|---|---|
| **Problem** | AMR robot is frequently powered off overnight. Auto-connect on boot floods logs with reconnect errors |
| **Solution** | AMR Modbus TCP session opened only when operator explicitly clicks "Connect" in browser. No auto-start |
| **Result** | Clean startup logs. System fully operational without AMR. 3 retry attempts with 1s backoff when connecting |
| **Files** | `amr_controller.py` |

---

## 19. Project Metrics & Numbers

### Codebase Statistics

```
  Lines of Code (estimated):
  ┌─────────────────────────────────────────────────┐
  │  Layer           │ Files  │ Approx. Lines       │
  ├─────────────────────────────────────────────────┤
  │  Backend Python  │  ~35   │  ~6,000             │
  │  Frontend React  │  ~25   │  ~8,000             │
  │  CSS / Tailwind  │  ~10   │  ~1,200             │
  │  DB Migrations   │  ~15   │  ~800               │
  │  Docker/Config   │  ~8    │  ~200               │
  ├─────────────────────────────────────────────────┤
  │  Total           │  ~93   │  ~16,200            │
  └─────────────────────────────────────────────────┘
```

### File Size Leaders

```
  Largest Files by Size:
  
  ████████████████████████████████████████ Triac.jsx      84 KB
  ████████████████████████████████████████ Assembly.jsx   84 KB
  ████████████████████████████████████  ██ Mirac.jsx      72 KB
  ████████████████████████              ██ mirac_broadcaster.py  44 KB
  ███████████████████████               ██ triac_broadcaster.py  39 KB
  ██████████████████                    ██ asrs_logic.py  28 KB
  ██████████████                        ██ amr_controller.py  22 KB
```

### Machine Network Map

| Machine | IP Address | Port | Protocol |
|---------|-----------|------|----------|
| AS/RS Storage | 10.10.14.104 | 4840 | OPC-UA |
| MIRAC CNC Lathe | 10.10.14.102 | 4840 | OPC-UA |
| MIRAC VibIT Gateway | 10.10.14.103 | 502 | Modbus TCP |
| TRIAC CNC Mill | 10.10.14.125 | 4840 | OPC-UA |
| TRIAC VibIT Gateway | 10.10.14.129 | 502 | Modbus TCP |
| Assembly Press | 10.10.14.113 | 4840 | OPC-UA |
| AMR Robot | 10.10.14.122 | 502 | Modbus TCP |
| TM Cobot | 10.10.14.106 | 5890 | Raw TCP/TMSCT |

---

## 20. Future Roadmap

```
  Q3 2026
  ──────────────────────────────────────────────────────────────────
  
  ◉ Inspection Station Integration
    Vision-system based accept/reject/rework decision logic.
    Automatic workpiece routing back to CNC or to storage via AMR.
    New backend station module + HMI page.
  
  ◉ Testing Station Integration
    Automated test result logging. Configurable pass/fail thresholds.
    Results feed into machine_events MES log with severity.
  
  Q4 2026
  ──────────────────────────────────────────────────────────────────
  
  ◉ Full Workflow Automation Engine
    End-to-end order-to-dispatch automation. Foundation already exists:
    workflows + workflow_steps tables + asyncio WorkflowEngine (2s poll).
    Remaining: production-ready step handlers for all station types.
  
  ◉ TimescaleDB Continuous Aggregates
    Hourly/daily vibration trend materialized views.
    Zero-scan analytical queries for predictive maintenance.
    OEE (Overall Equipment Effectiveness) calculations.
  
  Q1 2027
  ──────────────────────────────────────────────────────────────────
  
  ◉ OEE Dashboard
    Availability × Performance × Quality KPI charts per machine.
    Shift-level reports, downtime categorization, trend analysis.
  
  ◉ Predictive Maintenance Alerts
    ML model on VibIT hypertable data to predict bearing failures.
    Automatic alarm before critical failure threshold reached.
  
  ◉ MQTT Integration
    Optional MQTT broker support for stations that prefer pub/sub.
    Config already references MQTT as planned additional channel type.
  
  ◉ Mobile-Responsive HMI
    Touch-optimized control panels for tablet use on the factory floor.
    Currently designed for desktop browser monitors.
```

---

## 21. Glossary

| Term | Full Form | Meaning |
|------|-----------|---------|
| **AS/RS** | Automated Storage and Retrieval System | Motorized rack-and-shuttle storage. 35 bins, 210 subcompartment slots |
| **AMR** | Autonomous Mobile Robot | Wheeled factory floor robot navigating between 7 named stations |
| **OPC-UA** | Open Platform Communications — Unified Architecture | Industrial IoT standard for machine data access and remote control |
| **Modbus TCP** | Modbus over TCP/IP | Industrial Ethernet protocol for register read/write operations |
| **TMSCT** | Techman Script Communication | Techman Robot proprietary packet protocol for TM Script execution |
| **VibIT** | — (product name) | Vibration measurement sensor with Modbus TCP output |
| **CoEDM** | Centre of Excellence in Digital Manufacturing | Research lab at BVM Engineering College |
| **HMI** | Human-Machine Interface | The browser dashboard and station control pages |
| **PLC** | Programmable Logic Controller | Industrial computer controlling machine operations |
| **MES** | Manufacturing Execution System | Software bridging ERP orders and factory floor operations |
| **OEE** | Overall Equipment Effectiveness | KPI = Availability × Performance × Quality |
| **TimescaleDB** | — | PostgreSQL extension for time-series data with hypertables |
| **Hypertable** | — | TimescaleDB time-partitioned table for efficient time-range queries |
| **Delta Protocol** | — | WS pattern transmitting only changed fields after initial snapshot |
| **orjson** | — | Rust-based Python JSON library, 5–10× faster than stdlib |
| **Alembic** | — | SQLAlchemy database migration tool for schema version control |
| **rAF** | requestAnimationFrame | Browser API for 60fps animation callbacks tied to display refresh |
| **Spring physics** | Critically-damped spring model | Physics interpolation from slow PLC data to smooth 60fps animation |
| **VibitGateway** | — | Singleton Modbus client registry ensuring 1 TCP connection per gateway IP |
| **wsCache.js** | WebSocket Cache | Global in-memory store preserving last WS state across React navigations |
| **deepMerge** | — | Client-side recursive object merge applying WS delta updates to state |

---

*Document version: 2.0 — Enhanced with diagrams, code, and detailed technical content*  
*Generated: July 2026 — CoEDM Internship Program, BVM Engineering College*
