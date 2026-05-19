"""
backend/stations/hydraulic_backend.py  — DEPRECATED DRAFT
===========================================================
This file was an early prototype superseded by hydraulic_station.py.
It is NOT imported by any active route or broadcaster.

Do NOT add logic here. All hydraulic control lives in:
  - backend/stations/hydraulic_station.py   (OPC-UA tags + run_hydraulic)
  - backend/websockets/hydraulic_broadcaster.py  (real-time WS stream)
  - backend/api/routes/assembly_control.py  (FastAPI endpoints)

The SERVER_URL and OPC-UA URL are controlled via:
  - backend/.env  →  HYDRAULIC_OPCUA_URL=opc.tcp://10.10.14.113:4840
  - backend/config.py  →  settings.HYDRAULIC_OPCUA_URL
"""

# Re-export from the canonical module so accidental imports don't create
# a second OPC-UA connection object pointing to a hardcoded IP.
from backend.stations.hydraulic_station import (
    run_hydraulic,
    opcua_connection,
    HYDRAULIC_TAGS,
    HYDRAULIC_DATA_TAGS,
)

__all__ = [
    "run_hydraulic",
    "opcua_connection",
    "HYDRAULIC_TAGS",
    "HYDRAULIC_DATA_TAGS",
]
