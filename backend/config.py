"""
backend/config.py — Central Configuration
==========================================
Single source of truth for ALL environment-controlled settings.

Usage:
    from backend.config import settings

    url = settings.ASRS_OPCUA_URL
    db  = settings.DATABASE_URL

All values come from backend/.env (or real environment variables).
Defaults are set for development; override in production via .env.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# Resolve the backend/ directory regardless of CWD
_BACKEND_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """
    Typed, validated settings loaded from backend/.env.

    Pydantic-Settings automatically:
      - reads from environment variables (case-insensitive)
      - reads from the .env file specified in model_config
      - validates types and raises clear errors for bad values
    """

    model_config = SettingsConfigDict(
        env_file=str(_BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",          # silently ignore unknown vars in .env
        case_sensitive=False,
    )

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    DATABASE_URL: str                   # required — must be set in .env

    # SQLAlchemy connection pool tuning
    DB_POOL_SIZE: int = 5               # number of persistent connections
    DB_MAX_OVERFLOW: int = 10           # extra connections beyond pool_size
    DB_POOL_TIMEOUT: int = 30           # seconds to wait for a connection
    DB_POOL_RECYCLE: int = 1800         # recycle connections older than 30 min
    DB_ECHO: bool = False               # set True to log every SQL statement

    # ── ASRS (Storage/Retrieval System) OPC-UA ───────────────────────────────
    ASRS_OPCUA_URL: str = "opc.tcp://10.10.14.104:4840"
    ASRS_OPCUA_NS: int = 4              # OPC-UA namespace index for ASRS tags

    # ── Hydraulic / Assembly Station OPC-UA ──────────────────────────────────
    HYDRAULIC_OPCUA_URL: str = "opc.tcp://10.10.14.113:4840"

    # ── MIRAC CNC Station OPC-UA ─────────────────────────────────────────────
    MIRAC_OPCUA_URL: str = "opc.tcp://10.10.14.102:4840"

    # ── TRIAC CNC Station OPC-UA ─────────────────────────────────────────────
    TRIAC_OPCUA_URL: str = "opc.tcp://10.10.14.125:4840"

    # ── VIBIT Vibration Sensor (Modbus TCP) — on MIRAC ───────────────────────
    VIBIT_HOST: str = "10.10.14.103"
    VIBIT_PORT: int = 502
    VIBIT_UNIT_ID: int = 1              # Modbus slave/unit ID
    VIBIT_UNIT_ID_2: int = 2            # Modbus slave/unit ID for second VIBIT sensor
    VIBIT_UNIT_ID_3: int = 3            # Modbus slave/unit ID for third VIBIT sensor

    # ── VIBIT Vibration Sensor (Modbus TCP) — on TRIAC ───────────────────────
    TRIAC_VIBIT_HOST: str = "10.10.14.129"
    TRIAC_VIBIT_PORT: int = 502
    TRIAC_VIBIT_UNIT_ID: int = 1        # Modbus slave/unit ID
    TRIAC_VIBIT_UNIT_ID_2: int = 2      # Modbus slave/unit ID for second VIBIT sensor
    TRIAC_VIBIT_UNIT_ID_3: int = 3      # Modbus slave/unit ID for third VIBIT sensor

    # ── TM Cobot (Raw TCP / TMSCT) ─────────────────────────────────────────
    COBOT_HOST: str = "10.10.14.106"
    COBOT_PORT: int = 5890

    # ── AMR Autonomous Mobile Robot (Modbus TCP) ───────────────────────────────
    AMR_HOST: str = "10.10.14.122"
    AMR_PORT: int = 502
    AMR_UNIT_ID: int = 1            # Modbus slave/unit ID
    

    # ── FastAPI Application ───────────────────────────────────────────────────
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = False

    # ── Logging ───────────────────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"             # DEBUG | INFO | WARNING | ERROR


# Module-level singleton — import and use directly:
#   from backend.config import settings
settings = Settings()
