#!/usr/bin/env python3
import os
import sys
import time
import json
from pathlib import Path

# Add the project root to sys.path so we can import backend modules
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from backend.communication.vibit_modbus import VibitModbusReader

def parse_env() -> dict:
    env_path = project_root / "backend" / ".env"
    env = {}
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                if "#" in line:
                    line = line.split("#")[0].strip()
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def main():
    print("=== MIRAC VIBIT Sensor Test ===")
    env = parse_env()
    
    host = env.get("VIBIT_HOST", "10.10.14.103")
    port = int(env.get("VIBIT_PORT", 502))
    unit_id = int(env.get("VIBIT_UNIT_ID", 1))
    
    print(f"Connecting to VIBIT at {host}:{port} (Unit ID: {unit_id})...")
    
    reader = VibitModbusReader(host=host, port=port)
    
    try:
        # Loop 5 times to show real-time changes
        for i in range(5):
            print(f"\n--- Reading {i+1}/5 ---")
            metrics = reader.read_snapshot(device_id=unit_id)
            if metrics:
                print(json.dumps(metrics, indent=2))
            else:
                print("Failed to read metrics (device might be offline or unreachable)")
            
            if i < 4:
                time.sleep(1.0)
    finally:
        reader.close()
        print("\nConnection closed.")

if __name__ == "__main__":
    main()
