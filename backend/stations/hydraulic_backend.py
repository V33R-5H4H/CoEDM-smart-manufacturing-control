from backend.communication.opcua_driver import OPCUAConnection

SERVER_URL = "opc.tcp://10.10.14.113:4840"

HYDRAULIC_TAGS = {
    "BEARING_ON": "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Bering_On",
    "SHAFT_ON":   "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Shaft_On",
    "ON":  "|var|AX-308EA0MA1P.Application.PLC_PRG.Relay4",
    "OFF": "|var|AX-308EA0MA1P.Application.PLC_PRG.Relay4",
}

# Create a shared OPCUAConnection instance but defer connection (lazy)
opcua_connection = OPCUAConnection(SERVER_URL)
connection_established = False

def _ensure_connection():
    global connection_established
    if not connection_established:
        opcua_connection.connect()
        connection_established = True

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
    """Execute hydraulic command (bearing/shaft or relay on/off)."""
    cmd = _validate_command(command)
    _ensure_connection()
    tag = HYDRAULIC_TAGS[cmd]

    # For relay ON/OFF use the explicit value; for bearing/shaft always True.
    if cmd in ("ON", "OFF"):
        value = cmd == "ON"
    else:
        value = True

    opcua_connection.set_node_state(tag, value=value)
    return {
        "success": True,
        "command": cmd,
        "tag": tag,
        "value": value,
        "message": f"Hydraulic command '{cmd}' executed"
    }


def disconnect_hydraulic() -> dict:
    """Disconnect the OPC UA connection gracefully."""
    try:
        opcua_connection.disconnect()
        global connection_established
        connection_established = False
        return {"success": True, "message": "OPC UA connection disconnected"}
    except Exception as e:
        return {"success": False, "message": f"Disconnect failed: {e}"}

