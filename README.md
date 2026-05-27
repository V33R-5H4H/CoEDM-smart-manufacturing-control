# CoEDM Smart Manufacturing Line — Centralized Control Software

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://postgresql.org)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://reactjs.org)

**Project ID:** 2026.05.1 | **Organization:** Center of Excellence in Digital Manufacturing (CoEDM), BVM Engineering College, Anand, Gujarat

## Overview

This project extends the existing centralized control software for the autonomous smart manufacturing line at CoEDM. It adds the **Inspection Station integration**, a **real-time dashboard**, a **PostgreSQL job-tracking database**, **alarm management**, and **automatic accept/reject/rework decision logic** — completing the full order-to-dispatch workflow.

## Manufacturing Line
Customer Order → AS/RS → AMR Transfer → Assembly → Inspection → [Decision] → CNC / Storage

## Project Structure

```
CoEDM-smart-manufacturing-control/
├── backend/              # Python/FastAPI backend
│   ├── api/             # REST API layer
│   ├── communication/   # Protocol drivers (OPC-UA, Modbus)
│   ├── core/            # Shared utilities
│   ├── database/        # Data layer
│   ├── services/        # Business logic layer
│   ├── stations/        # Hardware abstraction
│   ├── websockets/      # WebSocket broadcasters
│   ├── tests/           # Test suite
│   └── scripts/         # Backend utilities
├── frontend/            # React frontend
│   └── src/
│       ├── components/  # Reusable UI components
│       ├── pages/       # Page components
│       ├── services/    # API client wrappers
│       ├── hooks/       # Custom React hooks
│       ├── styles/      # Global styles
│       └── theme/       # Theme context
├── docs/                # Documentation
├── scripts/             # Utility scripts
├── reference/           # Reference materials
└── stitch_designs/      # UI mockup assets
```

See `reference/structure.md` for detailed directory structure.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, asyncua, pymodbus |
| Database | PostgreSQL 15, SQLAlchemy ORM |
| Dashboard | React 18, Recharts, WebSocket |
| Communication | OPC-UA, Modbus TCP/RTU, (optional) MQTT |
| Testing | pytest, httpx |

## Getting Started

See `CONTRIBUTING.md` for development setup and contribution guidelines.

## Documentation

- `ARCHITECTURE.md` - System architecture overview
- `CONTRIBUTING.md` - Development guidelines
- `reference/context.md` - Project context
- `reference/structure.md` - Directory structure

## License

Proprietary — Center of Excellence in Digital Manufacturing (CoEDM)

*CoEDM Internship Program — May 2026 | BVM Engineering College, Vallabh Vidyanagar, Anand 388120*
