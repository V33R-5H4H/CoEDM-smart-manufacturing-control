# CoEDM Smart Manufacturing Control — System Architecture

## Overview

This document describes the high-level architecture of the CoEDM Smart Manufacturing Control system.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   React Frontend │  │   WebSocket      │  │   Mobile Apps    │          │
│  │   (Vite/React)   │  │   Broadcasters   │  │   (Future)       │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYER                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   API Routes     │  │   Services       │  │   WebSockets     │          │
│  │   (FastAPI)      │  │   (Business)     │  │   Broadcasters   │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DOMAIN LAYER                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Stations       │  │   Communication  │  │   Core Utils     │          │
│  │   (Hardware)     │  │   Drivers        │  │   (Timezone,     │          │
│  │                  │  │                  │  │   Delta, etc.)   │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA LAYER                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Database       │  │   ORM/Query      │  │   Migrations     │          │
│  │   (PostgreSQL)   │  │   Layer          │  │   & Seeds        │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## System Components

### 1. Frontend (React + Vite)

**Purpose:** User interface for operators and engineers

**Key Features:**
- Real-time monitoring dashboards
- Machine control interfaces
- WebSocket-based live data updates
- Interactive visualizations (SVG-based machine views)
- Responsive design for desktop and tablet

**Technology Stack:**
- React 19 with functional components and hooks
- Vite 7 for fast development and optimized builds
- Tailwind CSS for styling
- Recharts for data visualization
- Framer Motion for animations

### 2. Backend (FastAPI)

**Purpose:** REST API, WebSocket broadcasting, and hardware communication

**Key Features:**
- RESTful API endpoints for all operations
- WebSocket broadcasters for real-time data streaming
- OPC-UA and Modbus TCP communication
- Database integration with SQLAlchemy
- Asynchronous processing for performance

**Technology Stack:**
- FastAPI 0.110 for async web framework
- SQLAlchemy 2.0 for database ORM
- asyncua for OPC-UA communication
- pymodbus for Modbus TCP communication
- websockets for WebSocket broadcasting

### 3. Hardware Integration

**Stations:**
- **ASRS (Automated Storage & Retrieval System)** - OPC-UA
- **Assembly Station (Hydraulic Press)** - OPC-UA
- **MIRAC CNC Lathe** - OPC-UA + Modbus (VIBIT sensors)
- **TRIAC CNC Mill** - OPC-UA + Modbus (VIBIT sensors)
- **AMR (Autonomous Mobile Robot)** - Modbus TCP (stub)
- **Cobot (Collaborative Robot)** - Raw TCP (stub)

**Communication Protocols:**
- OPC-UA (Unified Automation) - Standard for industrial automation
- Modbus TCP/RTU - Legacy industrial protocol
- Raw TCP (TMSCT) - TM Robot protocol

### 4. Database (PostgreSQL)

**Purpose:** Data persistence and historical logging

**Schemas:**
- **Inventory Schema** - Legacy ASRS inventory management
- **MES Schema** - Modern Manufacturing Execution System

**Key Tables:**
- `machines` - Machine registry
- `machine_sensors` - Sensor/PLC registry
- `storage_items` - Item catalog
- `storage_boxes` - Storage locations
- `storage_compartments` - Sub-compartments
- `storage_transactions` - Transaction history
- `shuttle_movements` - Shuttle movement history
- `orders` - Customer orders
- `order_items` - Order line items
- `machine_events` - System events and alarms
- `machine_connections` - Connection history
- `mirac_sensor_data` - MIRAC sensor data
- `triac_sensor_data` - TRIAC sensor data
- `vibit_readings` - Vibration sensor readings
- `energy_meter_data` - Energy consumption data
- `assembly_station_data` - Assembly station data

---

## Data Flow

### 1. Real-Time Monitoring Flow

```
Hardware (PLC/Sensor)
    │
    ├─ OPC-UA / Modbus
    │
    ▼
Communication Driver (opcua.py / modbus.py)
    │
    ▼
Station Module (asrs_station.py, etc.)
    │
    ├─ Database Write (logging)
    │
    ▼
WebSocket Broadcaster (asrs_broadcaster.py, etc.)
    │
    ▼
Frontend (WebSocket Client)
```

### 2. Control Command Flow

```
Frontend (User Action)
    │
    ├─ REST API POST
    │
    ▼
API Route Handler (asrs_control.py, etc.)
    │
    ▼
Station Controller (ASRSController)
    │
    ├─ OPC-UA / Modbus Write
    │
    ▼
Hardware (PLC)
```

### 3. Data Persistence Flow

```
Station Module
    │
    ├─ Database Insert (logging)
    │
    ▼
PostgreSQL Database
```

---

## Technology Decisions

### Why FastAPI?
- Async support for concurrent connections
- Automatic API documentation (OpenAPI/Swagger)
- Type hints and Pydantic validation
- High performance comparable to Node.js and Go

### Why React?
- Component-based architecture for maintainability
- Large ecosystem and community support
- Virtual DOM for efficient UI updates
- Strong typing with TypeScript (when adopted)

### Why PostgreSQL?
- ACID compliance for data integrity
- JSONB support for flexible data storage
- Strong support for time-series data
- Mature ecosystem and tooling

### Why OPC-UA?
- Platform-independent standard
- Security features (encryption, authentication)
- Pub/Sub and subscription models
- Vendor-neutral protocol

---

## Security Considerations

1. **Authentication/Authorization** - Not yet implemented
2. **Data Encryption** - TLS for OPC-UA, HTTPS for API
3. **Access Control** - Role-based access (planned)
4. **Audit Logging** - Event logging for all operations

---

## Scalability Considerations

1. **Horizontal Scaling** - Frontend can be CDN-delivered
2. **Database Scaling** - Read replicas for reporting
3. **WebSocket Scaling** - Redis pub/sub for multiple backend instances
4. **Caching** - Redis for frequently accessed data

---

## Future Enhancements

1. **Workflow Engine** - Automatic sequencing between stations
2. **Job Dispatcher** - Queue-based job management
3. **Alarm Management** - Centralized alarm system
4. **User Authentication** - JWT-based auth
5. **Mobile Apps** - iOS/Android applications
6. **Predictive Maintenance** - ML-based anomaly detection
7. **Energy Optimization** - Real-time energy monitoring
8. **OEE Dashboard** - Overall Equipment Effectiveness

---

## Deployment

### Development
```bash
# Start backend
cd backend
python -m uvicorn api.main:app --reload

# Start frontend
cd frontend
npm run dev
```

### Production
- Backend: Docker container with gunicorn/uvicorn
- Frontend: Static files served by Nginx
- Database: PostgreSQL 15 (Docker or managed service)
- WebSocket: Separate process or container

---

## Monitoring

1. **Health Check** - `/api/health` endpoint
2. **Logging** - Python logging with configurable levels
3. **Metrics** - Prometheus metrics (planned)
4. **Alerting** - Email/webhook notifications (planned)

---

## Support

For issues and questions:
- Check documentation in `docs/`
- Review architecture diagrams in `docs/architecture/`
- Contact the development team
