from backend.communication.opcua_driver import OPCUAConnection
from backend.config import settings
import logging

SERVER_URL = settings.HYDRAULIC_OPCUA_URL

HYDRAULIC_TAGS = {
    "BEARING_ON": "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Bering_On",
    "SHAFT_ON":   "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Shaft_On",
}

# Hydraulic system monitoring variables (for reading data)
HYDRAULIC_DATA_TAGS = {
    # Assembly operations (command outputs)
    "bearing_operation": "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Bering_On",
    "shaft_operation": "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Shaft_On",

    # Position / Motion
    "displacement_mm": "|var|AX-308EA0MA1P.Application.GVL.mm",

    # Vice state
    "vice_open": "|var|AX-308EA0MA1P.Application.GVL.open",
    "vice_close": "|var|AX-308EA0MA1P.Application.GVL.Close",

    # Safety outputs
    "buzzer": "|var|AX-308EA0MA1P.Application.PLC_PRG.output06",

    # Safety light stack
    "light_red": "|var|AX-308EA0MA1P.Application.PLC_PRG.Red",
    "light_orange": "|var|AX-308EA0MA1P.Application.PLC_PRG.Orange",
    "light_green": "|var|AX-308EA0MA1P.Application.PLC_PRG.Relay4",

    # Safety curtain
    "safety_curtain": "|var|AX-308EA0MA1P.Application.GVL.Buzzer"
}

# Create a shared OPCUAConnection instance but defer connection (lazy)
opcua_connection = OPCUAConnection(SERVER_URL)
connection_established = False

def _ensure_connection():
    """
    Ensure connection is established before operations.
    Lazy connection: connects only on first API call.
    """
    global connection_established
    if not connection_established:
        try:
            logging.info("[HYDRAULIC] Establishing lazy connection to OPC UA server...")
            opcua_connection.connect()
            connection_established = True
            logging.info("[HYDRAULIC] Connected to OPC UA server at %s", SERVER_URL)
        except Exception as e:
            logging.error("[HYDRAULIC] Connection failed: %s", e)
            raise Exception(f"Failed to connect to Hydraulic OPC UA server: {e}")

def _validate_command(command: str) -> str:
    """
    Validate and normalize command format.
    
    Args:
        command: Command string (e.g., "BEARING_ON")
    
    Returns:
        Validated command in uppercase
    
    Raises:
        ValueError: If command is invalid
    """
    cmd = command.upper().strip()
    
    if cmd not in HYDRAULIC_TAGS:
        available = list(HYDRAULIC_TAGS.keys())
        raise ValueError(
            f"Invalid Hydraulic command '{command}'. "
            f"Available commands: {', '.join(available)}"
        )
    
    return cmd

def run_hydraulic(command: str) -> dict:
    """
    Execute a hydraulic/assembly control command.
    
    Algorithm:
    1. Validate command format
    2. Ensure OPC UA connection (lazy)
    3. Map command to OPC UA tag
    4. Set node state
    5. Return result
    
    Args:
        command: Hydraulic command (e.g., "BEARING_ON", "SHAFT_ON")
    
    Returns:
        {
            "success": True,
            "command": "BEARING_ON",
            "tag": "|var|AX-...",
            "message": "Command executed successfully"
        }
    
    Raises:
        ValueError: If command format invalid
        Exception: If connection fails or command execution fails
    """
    try:
        # Validate command
        cmd = _validate_command(command)

        # Ensure connection (lazy)
        _ensure_connection()

        # Get tag
        tag = HYDRAULIC_TAGS[cmd]

        # Send command
        logging.info("[HYDRAULIC] Sending command: %s", cmd)
        opcua_connection.set_node_state(tag)
        logging.info("[HYDRAULIC] Command executed: %s", cmd)

        return {
            "success": True,
            "command": cmd,
            "tag": tag,
            "message": f"Hydraulic command '{cmd}' executed successfully"
        }
    except ValueError as ve:
        logging.warning("[HYDRAULIC] Validation error: %s", ve)
        raise
    except Exception as e:
        logging.error("[HYDRAULIC] Execution error: %s", e)
        raise

