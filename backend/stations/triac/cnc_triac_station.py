from backend.communication.opcua_driver import OPCUAConnection
from backend.config import settings

SERVER_URL = settings.TRIAC_OPCUA_URL

# Create a shared OPCUAConnection instance but defer connection (lazy)
opcua_connection = OPCUAConnection(SERVER_URL)
connection_established = False

def connect_triac():
    """Explicitly connect to the Triac-PC OPC UA server."""
    global connection_established
    if not connection_established or not opcua_connection.connected:
        try:
            import logging
            logging.info("[TRIAC] Connecting to OPC UA server...")
            opcua_connection.connect()
            connection_established = True
            logging.info("[TRIAC] Connected to OPC UA server at %s", SERVER_URL)
            return True, "Connected successfully"
        except Exception as e:
            import logging
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
        import logging
        logging.info("[TRIAC] Disconnected from OPC UA server")
        return True, "Disconnected successfully"
    except Exception as e:
        import logging
        logging.error("[TRIAC] Disconnect failed: %s", e)
        return False, str(e)

def get_triac_status():
    """Get the current connection status."""
    return {
        "connected": opcua_connection.connected and connection_established
    }
