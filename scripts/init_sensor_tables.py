"""
scripts/init_sensor_tables.py — Create sensor data tables
==========================================================
Run once (or anytime) to create the sensor history tables.

Usage:
    python scripts/init_sensor_tables.py
"""

import sys
import os

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database.sensor_data import create_sensor_tables

if __name__ == "__main__":
    print("Creating sensor data tables...")
    create_sensor_tables()
    print("Done. All sensor tables are ready.")
