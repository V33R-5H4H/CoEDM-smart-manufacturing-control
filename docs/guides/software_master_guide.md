# CoEDM Smart Manufacturing - Software Master Guide

Welcome to the CoEDM Smart Manufacturing Control software. This guide serves as the entry point for both **users (operators)** and **developers**. It provides a top-level view of how the software is structured, how the pieces fit together, and how to operate or develop the system.

> [!NOTE]
> This guide covers **only the software**. For hardware wiring, PLC ladder logic, or mechanical CAD designs, please refer to the respective engineering repositories.

---

## 1. System Overview

The CoEDM software is a centralized platform that controls and monitors an autonomous manufacturing line. It handles everything from customer orders placed on an e-commerce site to the physical routing of items via Autonomous Mobile Robots (AMRs) and Automated Storage and Retrieval Systems (ASRS).

### Tech Stack
- **Backend API & Hardware Control:** Python 3.11, FastAPI, `asyncua` (OPC-UA), `pymodbus` (Modbus TCP/RTU)
- **Database:** PostgreSQL 15 with TimescaleDB (for time-series telemetry), SQLAlchemy ORM
- **Admin Dashboard (Frontend):** React 18, Vite, Recharts, WebSockets
- **E-Commerce Store (Ecom):** React 18, Vite

---

## 2. Core Components

The system is split into four primary services:

1. **Backend (`/backend`)**
   The central nervous system. It exposes REST APIs for the frontends, manages the PostgreSQL database, and holds persistent WebSocket connections to stream live telemetry. Crucially, it also acts as the direct client to the PLCs and AMRs using industrial protocols.
2. **Admin Frontend (`/frontend`)**
   The internal dashboard used by lab operators. It provides real-time visualization of the ASRS, AMR fleet, and assembly stations. Operators can trigger manual overrides, view alarms, and manage the production queue.
3. **E-Commerce Storefront (`/ecom`)**
   The customer-facing website where clients can place orders for manufactured goods. These orders flow directly into the backend's production database.
4. **Database**
   A PostgreSQL container that stores all system state, user accounts, order history, and sensor telemetry.

---

## 3. Directory Structure

When navigating the repository, you will find the following key directories:

- `backend/`: Python FastAPI source code.
  - `api/`: REST endpoints and routers.
  - `database/`: SQLAlchemy models, connection setup, and raw SQL schemas.
  - `stations/`: Hardware communication logic (AMR, ASRS, Mirac, etc.).
  - `websockets/`: Real-time data broadcasters.
- `frontend/`: The React source for the Admin Dashboard.
- `ecom/`: The React source for the E-Commerce store.
- `docs/`: Deep-dive documentation.
  - `architecture/`: DFDs, ERDs, State Machines, Sequence Diagrams.
  - `api/`: API references and schemas.
  - `guides/`: Setup and deployment guides.
- `scripts/`: Utility scripts (e.g., `make_ecom_admin.py`).
- `.github/workflows/`: CI/CD pipeline definitions for automated testing and deployment.

---

## 4. Developer Guide

### 4.1 Local Development Setup

To run the system locally with hot-reloading for development:

1. **Start the Database (Docker):**
   ```bash
   docker run --name pg_test_db -e POSTGRES_USER=coedm -e POSTGRES_PASSWORD=coedm_password -e POSTGRES_DB=coedm -p 5432:5432 -d timescale/timescaledb:latest-pg16
   ```

2. **Run the Backend:**
   Ensure you have a `.env` file in the `backend/` folder (copy from `.env.example`).
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
   pip install -r requirements.txt
   uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Run the Admin Dashboard & E-Commerce:**
   In two separate terminals:
   ```bash
   cd frontend
   npm install && npm run dev
   ```
   ```bash
   cd ecom
   npm install && npm run dev
   ```

### 4.2 Running Tests
The backend has a suite of pytest tests. You can run them via:
```bash
cd backend
pytest tests/ -q
```

---

## 5. Deployment & Operations

### Production Environment (Docker Compose)
In production (e.g., on the `xenserver`), all services are containerized using Docker Compose. The production `.env.docker` file sits at the repository root and contains sensitive hardware IPs and database passwords.

To deploy or restart services manually:
```bash
docker compose -p coedm-prod down
docker compose -p coedm-prod build --no-cache
docker compose -p coedm-prod up -d
```

### CI/CD Pipeline
The repository uses GitHub Actions. Pushing directly to `main` is restricted.
1. Create a `feature-branch`.
2. Open a Pull Request.
3. On merge, the CI pipeline (`.github/workflows/ci.yml`) will lint, test, and automatically deploy the changes to the production server.

> [!WARNING]
> Do not modify `.env.docker` via Git. It is stored securely on the production server.

---

## 6. Navigating the Documentation

For deeper dives into specific areas, consult the `docs/` folder:

- [Project Overview](file:///d:/CoEDM/docs/PROJECT_OVERVIEW.md)
- [Setup & Deployment Guide](file:///d:/CoEDM/docs/guides/setup_and_deployment_guide.md)
- [Database Schema & Migrations](file:///d:/CoEDM/docs/guides/database_schema_and_migration.md)
- [Architecture Diagrams](file:///d:/CoEDM/docs/architecture/) (ERDs, Sequence Diagrams, DFDs)
- [API Reference](file:///d:/CoEDM/docs/api/)

---

## 7. Common Tasks

**Upgrading an E-Commerce User to Admin:**
If you need to access the E-Commerce Admin panel, run the following script against the production backend container:
```bash
docker exec -it coedm_backend python scripts/make_ecom_admin.py user@example.com
```

**Viewing Logs:**
```bash
docker logs -f coedm_backend
```
