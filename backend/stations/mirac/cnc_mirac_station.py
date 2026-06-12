from backend.communication.opcua_driver import OPCUAConnection
from backend.config import settings
import logging
import asyncio

SERVER_URL = settings.MIRAC_OPCUA_URL

MIRAC_DATA_TAGS = {
    # Status LEDs
    "led_red": "ns=4;i=8",
    "led_yellow": "ns=4;i=9",
    "led_green": "ns=4;i=10",
    
    # Spindle
    "spindle_speed": "ns=4;i=24",
    "spindle_temp": "ns=4;i=20",
    "spindle_vibration": "ns=4;i=22",
    
    # Tool Data
    "tool_number": "ns=4;i=13",
    "tool_temp": "ns=4;i=19",
    "tool_vibration": "ns=4;i=21",
    
    # Axes
    "x_axis_value": "ns=4;i=11",
    "z_axis_value": "ns=4;i=12",
    "x_axis_feed": "ns=4;i=14",
    "z_axis_feed": "ns=4;i=15",
    
    # Controls / state
    "cycle_start": "ns=4;i=16",
    "cycle_stop": "ns=4;i=17",
    "pneumatic_chuck": "ns=4;i=23"
}

MIRAC_CONTROL_TAGS = {
    "cy_start_remote": "ns=4;i=82",
    "cy_stop_remote": "ns=4;i=93",
    "cy_reset_remote": "ns=4;i=104"
}

# Create a shared OPCUAConnection instance but defer connection (lazy)
opcua_connection = OPCUAConnection(SERVER_URL)
connection_established = False

def connect_mirac():
    """Explicitly connect to the Mirac-PC OPC UA server."""
    global connection_established
    if not connection_established or not opcua_connection.connected:
        try:
            logging.info("[MIRAC] Connecting to OPC UA server...")
            opcua_connection.connect()
            connection_established = True
            logging.info("[MIRAC] Connected to OPC UA server at %s", SERVER_URL)
            return True, "Connected successfully"
        except Exception as e:
            logging.error("[MIRAC] Connection failed: %s", e)
            raise Exception(f"Failed to connect to Mirac OPC UA server: {e}")
    return True, "Already connected"

def disconnect_mirac():
    """Explicitly disconnect from the Mirac-PC OPC UA server."""
    global connection_established
    try:
        if opcua_connection.connected:
            opcua_connection.disconnect()
        connection_established = False
        logging.info("[MIRAC] Disconnected from OPC UA server")
        return True, "Disconnected successfully"
    except Exception as e:
        logging.error("[MIRAC] Disconnect failed: %s", e)
        return False, str(e)

def get_mirac_status():
    """Get the current connection status."""
    return {
        "connected": opcua_connection.connected and connection_established
    }

async def pulse_mirac_command(action: str):
    """Pulse start, stop, or reset command asynchronously."""
    if action not in ["start", "stop", "reset"]:
        raise ValueError(f"Invalid action: {action}")
    
    if action == "start":
        tag = MIRAC_CONTROL_TAGS["cy_start_remote"]
        duration = 0.5
    elif action == "stop":
        tag = MIRAC_CONTROL_TAGS["cy_stop_remote"]
        duration = 0.5
    else: # reset
        tag = MIRAC_CONTROL_TAGS["cy_reset_remote"]
        duration = 0.02
        
    try:
        await asyncio.to_thread(opcua_connection.set_node_state, tag, True)
        await asyncio.sleep(duration)
        await asyncio.to_thread(opcua_connection.set_node_state, tag, False)
        return True, f"Pulsed {action} successfully"
    except Exception as e:
        logging.error(f"[MIRAC] Pulse {action} failed: {e}")
        raise Exception(f"Failed to pulse {action} command: {e}")
