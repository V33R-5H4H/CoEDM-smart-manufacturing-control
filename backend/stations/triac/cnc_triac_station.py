from backend.communication.opcua_driver import OPCUAConnection
from backend.config import settings

SERVER_URL = settings.TRIAC_OPCUA_URL

# Create a shared OPCUAConnection instance but defer connection (lazy)
opcua_connection = OPCUAConnection(SERVER_URL)
connection_established = False
