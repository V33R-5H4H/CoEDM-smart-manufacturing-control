from backend.communication.opcua_driver import OPCUAConnection
from backend.config import settings

SERVER_URL = settings.TRIAC_OPCUA_URL

# Triac CNC system monitoring variables (placeholder tags)
TRIAC_DATA_TAGS = {
    # Position / Motion
    "x_pos": "|var|AX-308.Application.GVL.X_Pos",
    "y_pos": "|var|AX-308.Application.GVL.Y_Pos",
    "z_pos": "|var|AX-308.Application.GVL.Z_Pos",
    
    # Spindle
    "spindle_speed": "|var|AX-308.Application.GVL.Spindle_Speed",
    
    # Status
    "tool_number": "|var|AX-308.Application.GVL.Tool_Number",
    "error_code": "|var|AX-308.Application.GVL.Error_Code",
}

# Create a shared OPCUAConnection instance but defer connection (lazy)
opcua_connection = OPCUAConnection(SERVER_URL)
connection_established = False
