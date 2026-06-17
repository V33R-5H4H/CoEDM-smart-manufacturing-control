import socket
import logging
from backend.config import settings

logger = logging.getLogger(__name__)

def calc_checksum(data: str) -> str:
    """Calculate the XOR checksum of a string and return it as 2-character hex."""
    chk = 0
    for ch in data:
        chk ^= ord(ch)
    return format(chk, "02X")

def build_tmsct(script: str, msg_id: str = "1") -> bytes:
    """
    Format a TMSCT packet according to TM Robot specs:
    $TMSCT,<length>,<message_id>,<script>,*<checksum>\r\n
    """
    body = f"{msg_id},{script}"
    length = len(body)
    header = f"$TMSCT,{length},{body},*"
    checksum = calc_checksum(header[1:header.index(",*") + 1])
    packet = f"$TMSCT,{length},{body},*{checksum}\r\n"
    return packet.encode()

def trigger_cobot_script(script: str = "ScriptExit()", msg_id: str = "1001") -> dict:
    """
    Establish a temporary socket connection to the TM Cobot,
    transmit the TMSCT packet, and return the robot's response.
    """
    host = settings.COBOT_HOST
    port = settings.COBOT_PORT
    
    logger.info(f"[COBOT] Triggering script on {host}:{port}...")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5.0)
    
    try:
        sock.connect((host, port))
        packet = build_tmsct(script, msg_id)
        logger.info(f"[COBOT] Sending packet: {packet!r}")
        sock.sendall(packet)
        
        # Read reply
        data = sock.recv(1024)
        if not data:
            return {"success": False, "message": "Connection closed by robot immediately."}
            
        decoded = data.decode(errors="ignore").strip()
        logger.info(f"[COBOT] Received response: {decoded}")
        
        # Check if response indicates success
        if "OK" in decoded:
            return {
                "success": True,
                "message": "Script executed successfully. Cobot proceeded.",
                "response": decoded
            }
        else:
            return {
                "success": False,
                "message": f"Cobot returned error or warning response: {decoded}",
                "response": decoded
            }
    except socket.timeout:
        return {
            "success": False,
            "message": f"Socket timeout: Could not reach Cobot at {host}:{port}. Ensure it is at the Listen node."
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to connect or communicate: {str(e)}"
        }
    finally:
        sock.close()
