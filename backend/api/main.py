"""
backend/api/main.py — FastAPI Application Entry Point
======================================================
Registers all routers, CORS, lifecycle events, and the /api/health endpoint.
"""

import asyncio
import logging
import logging.config

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.config import settings
from backend.database.db import engine, verify_db
from backend.api.routes.control.asrs import asrs_control
from backend.api.routes.control.assembly import assembly_control
from backend.api.routes.control.mirac import mirac_control
from backend.api.routes.control.asrs.shuttle import router as shuttle_router
from backend.api.routes.data.asrs.asrs_data import router as asrs_data_router
from backend.api.routes import sensor_data
from backend.stations.asrs.asrs_singleton import asrs_controller
from backend.websockets.assembly_broadcaster import hydraulic_broadcaster
from backend.websockets.mirac_broadcaster import mirac_broadcaster
from backend.websockets.asrs_broadcaster import led_ws_manager
from backend.stations.assembly.hydraulic_station import opcua_connection as hydraulic_opcua_connection
from backend.stations.mirac.cnc_mirac_station import opcua_connection as mirac_opcua_connection
from backend.stations.triac import triac_opcua_connection

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CoEDM Smart Manufacturing Control API",
    description="Real-time control and monitoring for ASRS, Hydraulic, and MIRAC CNC stations.",
    version="1.0.0",
    debug=settings.DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(asrs_control.router)
app.include_router(assembly_control.router)
app.include_router(mirac_control.router)
app.include_router(shuttle_router)
app.include_router(asrs_data_router)
app.include_router(sensor_data.router)


# ── Lifecycle ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    """
    On startup:
    1. Verify PostgreSQL connectivity.
    2. Inject event loop into LED service for async callbacks.
    3. Register LED and shuttle state-change → WebSocket broadcast callbacks.
    """
    loop = asyncio.get_event_loop()

    # 1. DB health check
    db_status = verify_db()
    if not db_status["ok"]:
        logger.error("[Startup] ⚠ Database is unreachable: %s", db_status["message"])
    else:
        logger.info("[Startup] ✓ Database OK")

    # 2. Set event loop on LED service (needed for bridge from OPC-UA thread)
    asrs_controller.led_service.set_event_loop(loop)

    # 3. LED state-change → WebSocket broadcast
    def _led_callback(box_id: str, active: bool, prev: bool):
        asyncio.run_coroutine_threadsafe(
            led_ws_manager.broadcast_led_change(box_id, active, prev),
            loop,
        )

    asrs_controller.led_service.register_callback(_led_callback)
    logger.info("[Startup] ✓ LED broadcast callback registered")

    # 4. Shuttle state-change → WebSocket broadcast
    def _shuttle_callback(row, col, state, command):
        asyncio.run_coroutine_threadsafe(
            led_ws_manager.broadcast_shuttle_state(row, col, state, command),
            loop,
        )

    asrs_controller.shuttle.register_callback(_shuttle_callback)
    logger.info("[Startup] ✓ Shuttle broadcast callback registered")

    # 5. Safety state-change → WebSocket broadcast
    def _safety_callback(active: bool, prev: bool):
        asyncio.run_coroutine_threadsafe(
            led_ws_manager.broadcast_safety_change(active),
            loop,
        )

    asrs_controller.led_service.register_safety_callback(_safety_callback)
    logger.info("[Startup] ✓ Safety broadcast callback registered")

    logger.info(
        "[Startup] Application ready  host=%s  port=%s  debug=%s  log=%s",
        settings.API_HOST, settings.API_PORT, settings.DEBUG, settings.LOG_LEVEL,
    )


@app.on_event("shutdown")
async def shutdown_event():
    """Gracefully disconnect all OPC-UA sessions on shutdown."""
    logger.info("[Shutdown] Cleaning up connections...")

    for name, conn in [
        ("ASRS",      asrs_controller),
        ("Hydraulic", hydraulic_opcua_connection),
        ("MIRAC",     mirac_opcua_connection),
        ("TRIAC",     triac_opcua_connection),
    ]:
        try:
            if name == "ASRS":
                conn.disconnect()           # ASRSController.disconnect()
            else:
                conn.disconnect()           # OPCUAConnection.disconnect()
            logger.info("[Shutdown] ✓ %s disconnected", name)
        except Exception as exc:
            logger.error("[Shutdown] %s disconnect error: %s", name, exc)


# ── Health endpoint ───────────────────────────────────────────────────────────

@app.get("/api/health", tags=["Health"])
async def health_check():
    """
    System health check.

    Returns the status of:
    - PostgreSQL database connection
    - ASRS OPC-UA connection
    - Hydraulic OPC-UA connection
    - MIRAC OPC-UA connection
    - TRIAC OPC-UA connection
    """
    db = verify_db()

    return {
        "status": "ok" if db["ok"] else "degraded",
        "database": {
            "connected": db["ok"],
            "message": db["message"],
            "url": db["url"],
        },
        "opcua": {
            "asrs": {
                "connected": asrs_controller.is_connected(),
                "url": settings.ASRS_OPCUA_URL,
            },
            "hydraulic": {
                "connected": hydraulic_opcua_connection.connected,
                "url": settings.HYDRAULIC_OPCUA_URL,
            },
            "mirac": {
                "connected": mirac_opcua_connection.connected,
                "url": settings.MIRAC_OPCUA_URL,
            },
            "triac": {
                "connected": triac_opcua_connection.connected,
                "url": settings.TRIAC_OPCUA_URL,
            },
        },
        "modbus": {
            "vibit": {
                "mirac_spindle": {
                    "host": settings.VIBIT_HOST,
                    "port": settings.VIBIT_PORT,
                    "unit_id": settings.VIBIT_UNIT_ID,
                },
                "mirac_tool": {
                    "host": settings.VIBIT_HOST,
                    "port": settings.VIBIT_PORT,
                    "unit_id": settings.VIBIT_UNIT_ID_2,
                },
                "mirac_axes": {
                    "host": settings.VIBIT_HOST,
                    "port": settings.VIBIT_PORT,
                    "unit_id": settings.VIBIT_UNIT_ID_3,
                },
                "triac_spindle": {
                    "host": settings.TRIAC_VIBIT_HOST,
                    "port": settings.TRIAC_VIBIT_PORT,
                    "unit_id": settings.TRIAC_VIBIT_UNIT_ID,
                },
                "triac_tool": {
                    "host": settings.TRIAC_VIBIT_HOST,
                    "port": settings.TRIAC_VIBIT_PORT,
                    "unit_id": settings.TRIAC_VIBIT_UNIT_ID_2,
                },
                "triac_axes": {
                    "host": settings.TRIAC_VIBIT_HOST,
                    "port": settings.TRIAC_VIBIT_PORT,
                    "unit_id": settings.TRIAC_VIBIT_UNIT_ID_3,
                },
            }
        },
    }
