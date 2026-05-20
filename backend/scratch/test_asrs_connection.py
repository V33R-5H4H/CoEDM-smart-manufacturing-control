import sys
import os
import logging

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

logging.basicConfig(level=logging.INFO)

from backend.stations.asrs.asrs_singleton import asrs_controller

try:
    print("Attempting ASRS Controller connect()...")
    asrs_controller.connect()
    print("ASRS Controller connect() succeeded!")
    print(f"Connection Status: {asrs_controller.is_connected()}")
    print("Getting LED states...")
    print(asrs_controller.get_led_states())
except Exception as e:
    import traceback
    print("Error connecting to ASRS OPC UA:")
    traceback.print_exc()
finally:
    try:
        asrs_controller.disconnect()
    except Exception:
        pass
