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

## Quick Reference

```
Start:   python start.py
Stop:    python stop.py
Tests:   backend\venv\Scripts\python.exe -m pytest backend\tests\ -q
Diag:    backend\venv\Scripts\python.exe reference\scripts\discovery\modbus_diagnostic.py
API:     http://localhost:8000/docs
App:     http://localhost:5173
```
