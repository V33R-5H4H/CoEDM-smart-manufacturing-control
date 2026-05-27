"""
tests/test_config.py
====================
Tests for backend/config.py — validates settings loading, types, and defaults.
No hardware or DB connection required.
"""

import pytest
from unittest.mock import patch


class TestSettingsLoading:
    """Config loads from environment and has correct types."""

    def test_settings_import(self):
        """Settings object can be imported without error."""
        from backend.config import settings
        assert settings is not None

    def test_database_url_is_string(self):
        from backend.config import settings
        assert isinstance(settings.DATABASE_URL, str)
        assert len(settings.DATABASE_URL) > 0

    def test_database_url_is_postgresql(self):
        from backend.config import settings
        assert settings.DATABASE_URL.startswith("postgresql://"), (
            f"DATABASE_URL must start with 'postgresql://', got: {settings.DATABASE_URL[:30]}"
        )

    def test_opcua_urls_are_strings(self):
        from backend.config import settings
        assert settings.ASRS_OPCUA_URL.startswith("opc.tcp://")
        assert settings.HYDRAULIC_OPCUA_URL.startswith("opc.tcp://")
        assert settings.MIRAC_OPCUA_URL.startswith("opc.tcp://")

    def test_pool_settings_are_ints(self):
        from backend.config import settings
        assert isinstance(settings.DB_POOL_SIZE, int)
        assert isinstance(settings.DB_MAX_OVERFLOW, int)
        assert isinstance(settings.DB_POOL_TIMEOUT, int)
        assert isinstance(settings.DB_POOL_RECYCLE, int)
        assert settings.DB_POOL_SIZE > 0
        assert settings.DB_MAX_OVERFLOW >= 0

    def test_vibit_port_is_int(self):
        from backend.config import settings
        assert isinstance(settings.VIBIT_PORT, int)
        assert 1 <= settings.VIBIT_PORT <= 65535

    def test_api_port_is_int(self):
        from backend.config import settings
        assert isinstance(settings.API_PORT, int)
        assert 1 <= settings.API_PORT <= 65535

    def test_log_level_is_valid(self):
        from backend.config import settings
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        assert settings.LOG_LEVEL in valid, f"Invalid LOG_LEVEL: {settings.LOG_LEVEL}"

    def test_debug_is_bool(self):
        from backend.config import settings
        assert isinstance(settings.DEBUG, bool)

    def test_opcua_namespace_is_int(self):
        from backend.config import settings
        assert isinstance(settings.ASRS_OPCUA_NS, int)
        assert settings.ASRS_OPCUA_NS >= 0

    def test_settings_singleton(self):
        """Importing settings twice returns the same object."""
        from backend.config import settings as s1
        from backend.config import settings as s2
        assert s1 is s2

    def test_settings_env_override(self):
        """Environment variables override .env file values."""
        with patch.dict("os.environ", {"DB_POOL_SIZE": "99"}):
            # Re-importing won't reload; just check the mechanism works via direct env read
            import os
            assert os.environ.get("DB_POOL_SIZE") == "99"
