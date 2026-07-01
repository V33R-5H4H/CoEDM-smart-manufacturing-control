from backend.communication.opcua_driver import OPCUAConnection
from backend.config import settings
import asyncio
import logging

SERVER_URL = settings.TRIAC_OPCUA_URL

# TRIAC Data Tags (from the provided screenshot)
TRIAC_DATA_TAGS = {
    # Axes
    "x_axis_value": "ns=4;i=112",
    "y_axis_value": "ns=4;i=101",
    "z_axis_value": "ns=4;i=123",
    
    # Tool Data
    "tool_number": "ns=4;i=90"
}

# TRIAC Control Tags (from the provided screenshot)
TRIAC_CONTROL_TAGS = {
    "cy_start_remote": "ns=4;i=167",
    "cy_stop_remote": "ns=4;i=145",
    "cy_reset_remote": "ns=4;i=156"
}

# Create a shared OPCUAConnection instance but defer connection (lazy)
opcua_connection = OPCUAConnection(SERVER_URL)
connection_established = False

def connect_triac():
    """Explicitly connect to the Triac-PC OPC UA server."""
    global connection_established
    if not connection_established or not opcua_connection.connected:
        try:
            logging.info("[TRIAC] Connecting to OPC UA server...")
            opcua_connection.connect()
            connection_established = True
            logging.info("[TRIAC] Connected to OPC UA server at %s", SERVER_URL)
            return True, "Connected successfully"
        except Exception as e:
            logging.error("[TRIAC] Connection failed: %s", e)
            return False, f"Failed to connect to Triac OPC UA server: {e}"
    return True, "Already connected"

def disconnect_triac():
    """Explicitly disconnect from the Triac-PC OPC UA server."""
    global connection_established
    try:
        if opcua_connection.connected:
            opcua_connection.disconnect()
        connection_established = False
        logging.info("[TRIAC] Disconnected from OPC UA server")
        return True, "Disconnected successfully"
    except Exception as e:
        logging.error("[TRIAC] Disconnect failed: %s", e)
        return False, str(e)

def get_triac_status():
    """Get the current connection status."""
    return {
        "connected": opcua_connection.connected and connection_established
    }

async def pulse_triac_command(action: str):
    """Pulse start, stop, or reset command asynchronously."""
    if action not in ["start", "stop", "reset"]:
        raise ValueError(f"Invalid action: {action}")
    
    if action == "start":
        tag = TRIAC_CONTROL_TAGS["cy_start_remote"]
        duration = 0.5
    elif action == "stop":
        tag = TRIAC_CONTROL_TAGS["cy_stop_remote"]
        duration = 0.5
    else: # reset
        tag = TRIAC_CONTROL_TAGS["cy_reset_remote"]
        duration = 0.5
        
    try:
        await asyncio.to_thread(opcua_connection.set_node_state, tag, True)
        await asyncio.sleep(duration)
        await asyncio.to_thread(opcua_connection.set_node_state, tag, False)
        return True, f"Pulsed {action} successfully"
    except Exception as e:
        logging.error(f"[TRIAC] Pulse {action} failed: {e}")
        raise Exception(f"Failed to pulse {action} command: {e}")
