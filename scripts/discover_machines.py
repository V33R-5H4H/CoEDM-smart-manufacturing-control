#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║               CoEDM — Machine Discovery & Diagnostics Script               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Connects to ALL configured machines (OPC-UA, Modbus, TCP) and reports:    ║
║    • Connection status & server info                                       ║
║    • Communication channels (OPC-UA / Modbus TCP / Raw TCP)                ║
║    • Browsable variables / tags — readable & writable                      ║
║    • Known register maps (VIBIT Modbus)                                    ║
║    • Cobot TCP socket reachability                                         ║
║                                                                            ║
║  Usage:                                                                    ║
║    python scripts/discover_machines.py                                     ║
║    python scripts/discover_machines.py --json          (JSON output)       ║
║    python scripts/discover_machines.py --timeout 5     (custom timeout)    ║
║                                                                            ║
║  NOTE: Run from the project root so that `backend` is importable.          ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import argparse
import json
import os
import socket
import struct
import sys
import time
from collections import OrderedDict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Ensure project root is on sys.path so we can import backend.config
# ---------------------------------------------------------------------------
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration — single source of truth: backend/config.py → .env
# ═══════════════════════════════════════════════════════════════════════════════

try:
    from backend.config import settings
except Exception as _import_err:
    print(
        f"\033[91m"
        f"ERROR: Could not import backend.config.settings\n"
        f"       {_import_err}\n\n"
        f"  All machine IPs are read from backend/.env via pydantic-settings.\n"
        f"  Make sure you:\n"
        f"    1. Run from the project root:  python scripts/discover_machines.py\n"
        f"    2. Have backend/.env with valid entries (see .env.example)\n"
        f"    3. Have pydantic-settings installed:  pip install pydantic-settings\n"
        f"\033[0m"
    )
    sys.exit(1)


def _cfg(name: str):
    """Read a config value from backend.config.settings (backed by .env)."""
    return getattr(settings, name)


# ═══════════════════════════════════════════════════════════════════════════════
# Machine definitions (static registry of everything we know about)
# ═══════════════════════════════════════════════════════════════════════════════

MACHINES: List[Dict[str, Any]] = [
    {
        "name": "ASRS (Automated Storage & Retrieval System)",
        "station": "asrs",
        "protocol": "OPC-UA",
        "url": lambda: _cfg("ASRS_OPCUA_URL"),
        "namespace": lambda: _cfg("ASRS_OPCUA_NS") or 4,
        "known_tags": {
            # Command nodes  (pulse TRUE→FALSE to trigger)
            "Store commands": {
                f"{col}{row}S": {
                    "node_id": f"ns=4;s={col}{row}S",
                    "direction": "WRITE (pulse)",
                    "type": "Boolean",
                    "description": f"Store box at column {col}, row {row}",
                }
                for col in "ABCDE" for row in range(1, 8)
            },
            "Retrieve commands": {
                f"{col}{row}": {
                    "node_id": f"ns=4;s={col}{row}",
                    "direction": "WRITE (pulse)",
                    "type": "Boolean",
                    "description": f"Retrieve box from column {col}, row {row}",
                }
                for col in "ABCDE" for row in range(1, 8)
            },
            "Home command": {
                "Home": {
                    "node_id": "ns=4;s=Home",
                    "direction": "WRITE (pulse)",
                    "type": "Boolean",
                    "description": "Return shuttle to home position (A7)",
                }
            },
            "LED feedback nodes": {
                f"led{col}{row}": {
                    "node_id": f"ns=4;s=led{col}{row}",
                    "direction": "READ (subscription)",
                    "type": "Boolean",
                    "description": f"LED indicator for box {col}{row} — ON=busy, OFF→ON→OFF=complete",
                }
                for col in "ABCDE" for row in range(1, 8)
            },
        },
    },
    {
        "name": "Hydraulic Assembly Station",
        "station": "assembly",
        "protocol": "OPC-UA",
        "url": lambda: _cfg("HYDRAULIC_OPCUA_URL"),
        "namespace": lambda: 4,
        "known_tags": {
            "Control commands (WRITE)": {
                "BEARING_ON": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Bering_On",
                    "direction": "WRITE (set_state)",
                    "type": "Boolean",
                    "description": "Activate bearing press operation",
                },
                "SHAFT_ON": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Shaft_On",
                    "direction": "WRITE (set_state)",
                    "type": "Boolean",
                    "description": "Activate shaft press operation",
                },
            },
            "Monitoring variables (READ)": {
                "bearing_operation": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Bering_On",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Bearing press operation status",
                },
                "shaft_operation": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Shaft_On",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Shaft press operation status",
                },
                "displacement_mm": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.GVL.mm",
                    "direction": "READ",
                    "type": "Float/Double",
                    "description": "Current displacement in millimeters",
                },
                "vice_open": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.GVL.open",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Vice open state",
                },
                "vice_close": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.GVL.Close",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Vice closed state",
                },
                "buzzer": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.output06",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Safety buzzer state",
                },
                "light_red": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.Red",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Red stack light",
                },
                "light_orange": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.Orange",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Orange stack light",
                },
                "light_green": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.PLC_PRG.Relay4",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Green stack light",
                },
                "safety_curtain": {
                    "node_id": "ns=4;s=|var|AX-308EA0MA1P.Application.GVL.Buzzer",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Safety curtain / light barrier state",
                },
            },
        },
    },
    {
        "name": "MIRAC CNC Station",
        "station": "mirac",
        "protocol": "OPC-UA",
        "url": lambda: _cfg("MIRAC_OPCUA_URL"),
        "namespace": lambda: 4,
        "known_tags": {
            "Status LEDs (READ)": {
                "led_red": {
                    "node_id": "ns=4;i=8",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Red status LED — fault / alarm",
                },
                "led_yellow": {
                    "node_id": "ns=4;i=9",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Yellow status LED — warning / standby",
                },
                "led_green": {
                    "node_id": "ns=4;i=10",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Green status LED — running / OK",
                },
            },
            "Spindle data (READ)": {
                "spindle_speed": {
                    "node_id": "ns=4;i=24",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Current spindle RPM",
                },
                "spindle_temp": {
                    "node_id": "ns=4;i=20",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Spindle temperature (°C)",
                },
                "spindle_vibration": {
                    "node_id": "ns=4;i=22",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Spindle vibration level",
                },
            },
            "Tool data (READ)": {
                "tool_number": {
                    "node_id": "ns=4;i=13",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Active tool number",
                },
                "tool_temp": {
                    "node_id": "ns=4;i=19",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Tool temperature (°C)",
                },
                "tool_vibration": {
                    "node_id": "ns=4;i=21",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Tool vibration level",
                },
            },
            "Axis positions (READ)": {
                "x_axis_value": {
                    "node_id": "ns=4;i=11",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "X-axis current position",
                },
                "z_axis_value": {
                    "node_id": "ns=4;i=12",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Z-axis current position",
                },
                "x_axis_feed": {
                    "node_id": "ns=4;i=14",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "X-axis feed rate",
                },
                "z_axis_feed": {
                    "node_id": "ns=4;i=15",
                    "direction": "READ",
                    "type": "Numeric",
                    "description": "Z-axis feed rate",
                },
            },
            "Cycle control (READ)": {
                "cycle_start": {
                    "node_id": "ns=4;i=16",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Cycle start signal",
                },
                "cycle_stop": {
                    "node_id": "ns=4;i=17",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Cycle stop signal",
                },
                "pneumatic_chuck": {
                    "node_id": "ns=4;i=23",
                    "direction": "READ",
                    "type": "Boolean",
                    "description": "Pneumatic chuck state (open/close)",
                },
            },
        },
    },
    {
        "name": "VIBIT Vibration Sensor (MIRAC)",
        "station": "mirac-vibit",
        "protocol": "Modbus TCP",
        "host": lambda: _cfg("VIBIT_HOST"),
        "port": lambda: _cfg("VIBIT_PORT"),
        "unit_id": lambda: _cfg("VIBIT_UNIT_ID"),
        "known_tags": {
            "Acceleration RMS (READ)": {
                "x_rms_acc": {
                    "register": "4001-4002",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis RMS acceleration (g)",
                },
                "y_rms_acc": {
                    "register": "4003-4004",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis RMS acceleration (g)",
                },
                "z_rms_acc": {
                    "register": "4005-4006",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis RMS acceleration (g)",
                },
            },
            "Velocity RMS (READ)": {
                "x_rms_vel": {
                    "register": "4007-4008",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis RMS velocity (mm/s)",
                },
                "y_rms_vel": {
                    "register": "4009-4010",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis RMS velocity (mm/s)",
                },
                "z_rms_vel": {
                    "register": "4011-4012",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis RMS velocity (mm/s)",
                },
            },
            "Temperature (READ)": {
                "temperature": {
                    "register": "4013-4014",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Sensor temperature (°C)",
                },
            },
            "Acceleration Peak (READ)": {
                "x_peak_acc": {
                    "register": "4015-4016",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis peak acceleration (g)",
                },
                "y_peak_acc": {
                    "register": "4017-4018",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis peak acceleration (g)",
                },
                "z_peak_acc": {
                    "register": "4019-4020",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis peak acceleration (g)",
                },
            },
            "Velocity Peak (READ)": {
                "x_peak_vel": {
                    "register": "4021-4022",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis peak velocity (mm/s)",
                },
                "y_peak_vel": {
                    "register": "4023-4024",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis peak velocity (mm/s)",
                },
                "z_peak_vel": {
                    "register": "4025-4026",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis peak velocity (mm/s)",
                },
            },
            "Device info (READ)": {
                "reboot_count": {
                    "register": "4031-4032",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Device reboot counter",
                },
                "led_status": {
                    "register": "4035-4036",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "On-board LED status code",
                },
                "rpm": {
                    "register": "4039-4040",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Measured RPM",
                },
            },
        },
    },
    {
        "name": "TM Cobot (Collaborative Robot)",
        "station": "cobot",
        "protocol": "Raw TCP (TM Script / TMSCT)",
        "host": lambda: _cfg("COBOT_HOST"),
        "port": lambda: _cfg("COBOT_PORT"),
        "known_tags": {
            "Script commands (WRITE via TMSCT)": {
                "var_var": {
                    "direction": "WRITE (TMSCT packet)",
                    "type": "Integer",
                    "description": "General-purpose variable; set to 1 to trigger script flow",
                },
                "ScriptExit()": {
                    "direction": "WRITE (TMSCT packet)",
                    "type": "Command",
                    "description": "End current script block and resume listening",
                },
            },
            "Listen node responses (READ via TCP)": {
                "housing placed": {
                    "direction": "READ (TCP message)",
                    "type": "String",
                    "description": "Robot signals housing has been placed — triggers vice close",
                },
                "bearing placed": {
                    "direction": "READ (TCP message)",
                    "type": "String",
                    "description": "Robot signals bearing has been placed — triggers bearing press",
                },
            },
        },
    },
    {
        "name": "TRIAC CNC Station (Smart PC)",
        "station": "triac",
        "protocol": "OPC-UA",
        "url": lambda: _cfg("TRIAC_OPCUA_URL"),
        "namespace": lambda: 4,
        "auto_discover": True,
        "known_tags": {
            # No hardcoded tags — all variables will be auto-discovered
            # via OPC-UA browse.  Likely similar to MIRAC (LEDs, spindle,
            # axes, tool data, cycle control) but not confirmed.
        },
    },
    {
        "name": "VIBIT Vibration Sensor (TRIAC)",
        "station": "triac-vibit",
        "protocol": "Modbus TCP",
        "host": lambda: _cfg("TRIAC_VIBIT_HOST"),
        "port": lambda: _cfg("TRIAC_VIBIT_PORT"),
        "unit_id": lambda: _cfg("TRIAC_VIBIT_UNIT_ID"),
        "known_tags": {
            "Acceleration RMS (READ)": {
                "x_rms_acc": {
                    "register": "4001-4002",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis RMS acceleration (g)",
                },
                "y_rms_acc": {
                    "register": "4003-4004",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis RMS acceleration (g)",
                },
                "z_rms_acc": {
                    "register": "4005-4006",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis RMS acceleration (g)",
                },
            },
            "Velocity RMS (READ)": {
                "x_rms_vel": {
                    "register": "4007-4008",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis RMS velocity (mm/s)",
                },
                "y_rms_vel": {
                    "register": "4009-4010",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis RMS velocity (mm/s)",
                },
                "z_rms_vel": {
                    "register": "4011-4012",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis RMS velocity (mm/s)",
                },
            },
            "Temperature (READ)": {
                "temperature": {
                    "register": "4013-4014",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Sensor temperature (°C)",
                },
            },
            "Acceleration Peak (READ)": {
                "x_peak_acc": {
                    "register": "4015-4016",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis peak acceleration (g)",
                },
                "y_peak_acc": {
                    "register": "4017-4018",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis peak acceleration (g)",
                },
                "z_peak_acc": {
                    "register": "4019-4020",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis peak acceleration (g)",
                },
            },
            "Velocity Peak (READ)": {
                "x_peak_vel": {
                    "register": "4021-4022",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "X-axis peak velocity (mm/s)",
                },
                "y_peak_vel": {
                    "register": "4023-4024",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Y-axis peak velocity (mm/s)",
                },
                "z_peak_vel": {
                    "register": "4025-4026",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Z-axis peak velocity (mm/s)",
                },
            },
            "Device info (READ)": {
                "reboot_count": {
                    "register": "4031-4032",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Device reboot counter",
                },
                "led_status": {
                    "register": "4035-4036",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "On-board LED status code",
                },
                "rpm": {
                    "register": "4039-4040",
                    "direction": "READ",
                    "type": "Float32 (word-swapped big-endian)",
                    "description": "Measured RPM",
                },
            },
        },
    },
    {
        "name": "AMR (Autonomous Mobile Robot)",
        "station": "amr",
        "protocol": "Modbus TCP",
        "host": lambda: _cfg("AMR_HOST"),
        "port": lambda: _cfg("AMR_PORT"),
        "unit_id": lambda: _cfg("AMR_UNIT_ID"),
        "auto_discover": True,
        "known_tags": {
            # No hardcoded registers — the script will scan common Modbus
            # holding-register ranges to discover what the device exposes.
        },
    },
]


# ═══════════════════════════════════════════════════════════════════════════════
# Connectivity probes
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_opcua_url(url: str) -> Tuple[str, int]:
    """Extract host and port from an opc.tcp:// URL."""
    # opc.tcp://10.10.14.104:4840
    stripped = url.replace("opc.tcp://", "").replace("opc.TCP://", "")
    host, port_str = stripped.split(":")
    return host.strip("/"), int(port_str.strip("/"))


def probe_tcp(host: str, port: int, timeout: float = 3.0) -> Dict[str, Any]:
    """Low-level TCP socket probe — checks if port is open."""
    result: Dict[str, Any] = {
        "host": host,
        "port": port,
        "reachable": False,
        "latency_ms": None,
        "error": None,
    }
    try:
        t0 = time.time()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, port))
        elapsed = (time.time() - t0) * 1000
        result["reachable"] = True
        result["latency_ms"] = round(elapsed, 1)
        sock.close()
    except socket.timeout:
        result["error"] = "Connection timed out"
    except ConnectionRefusedError:
        result["error"] = "Connection refused (port closed or no service)"
    except OSError as e:
        result["error"] = str(e)
    return result


def probe_opcua(url: str, timeout: float = 5.0) -> Dict[str, Any]:
    """
    Connect to an OPC-UA server, grab server info, and browse the root
    namespace to discover all available nodes.
    """
    result: Dict[str, Any] = {
        "url": url,
        "connected": False,
        "server_info": None,
        "namespaces": [],
        "discovered_nodes": [],
        "node_count": 0,
        "error": None,
    }

    try:
        from asyncua.sync import Client
        from asyncua import ua
    except ImportError:
        result["error"] = "asyncua not installed — pip install asyncua"
        return result

    client = None
    try:
        client = Client(url, timeout=timeout)
        client.connect()
        result["connected"] = True

        # Server description
        try:
            server_node = client.get_node(ua.ObjectIds.Server)
            status_node = client.get_node(ua.ObjectIds.Server_ServerStatus)
            status = status_node.get_value()
            result["server_info"] = {
                "state": str(status.State) if hasattr(status, "State") else "Unknown",
                "start_time": str(status.StartTime) if hasattr(status, "StartTime") else None,
                "current_time": str(status.CurrentTime) if hasattr(status, "CurrentTime") else None,
                "build_info": str(status.BuildInfo) if hasattr(status, "BuildInfo") else None,
            }
        except Exception:
            result["server_info"] = {"state": "Connected (details unavailable)"}

        # Namespace array
        try:
            ns_node = client.get_node(ua.ObjectIds.Server_NamespaceArray)
            result["namespaces"] = ns_node.get_value()
        except Exception:
            pass

        # Browse root → Objects
        discovered = []
        try:
            objects_node = client.get_node(ua.ObjectIds.ObjectsFolder)
            _browse_recursive(client, objects_node, discovered, max_depth=4, max_nodes=500)
        except Exception as e:
            result["error"] = f"Browse error: {e}"

        result["discovered_nodes"] = discovered
        result["node_count"] = len(discovered)

    except Exception as e:
        result["error"] = str(e)
    finally:
        if client:
            try:
                client.disconnect()
            except Exception:
                pass

    return result


def _browse_recursive(
    client,
    node,
    out: list,
    max_depth: int = 4,
    max_nodes: int = 500,
    depth: int = 0,
    path: str = "",
):
    """Recursively browse OPC-UA nodes up to max_depth / max_nodes."""
    if depth > max_depth or len(out) >= max_nodes:
        return

    try:
        children = node.get_children()
    except Exception:
        return

    for child in children:
        if len(out) >= max_nodes:
            return
        try:
            name = child.get_browse_name().to_string()
            node_id = child.nodeid.to_string()
            node_class = str(child.get_node_class())

            # Try to read value for Variable nodes
            value = None
            data_type = None
            writable = False
            if "Variable" in node_class:
                try:
                    value = child.get_value()
                    # Truncate long values
                    val_str = str(value)
                    if len(val_str) > 120:
                        val_str = val_str[:120] + "..."
                    value = val_str
                except Exception:
                    value = "<unreadable>"
                try:
                    attr = child.get_attribute(
                        __import__("asyncua", fromlist=["ua"]).ua.AttributeIds.AccessLevel
                    )
                    access = attr.Value.Value
                    writable = bool(access & 0x02) if isinstance(access, int) else False
                except Exception:
                    pass
                try:
                    dt = child.get_data_type_as_variant_type()
                    data_type = str(dt)
                except Exception:
                    data_type = "Unknown"

            full_path = f"{path}/{name}" if path else name
            entry = {
                "node_id": node_id,
                "browse_name": name,
                "path": full_path,
                "node_class": node_class,
                "data_type": data_type,
                "current_value": value,
                "writable": writable,
            }
            out.append(entry)

            # Recurse into Objects & FolderTypes
            if "Object" in node_class:
                _browse_recursive(client, child, out, max_depth, max_nodes, depth + 1, full_path)
        except Exception:
            continue


# Known register groups for VIBIT sensors
_VIBIT_REGISTER_GROUPS = [
    (4001, 26, [
        (0,  "x_rms_acc"),   (2,  "y_rms_acc"),   (4,  "z_rms_acc"),
        (6,  "x_rms_vel"),   (8,  "y_rms_vel"),   (10, "z_rms_vel"),
        (12, "temperature"), (14, "x_peak_acc"),   (16, "y_peak_acc"),
        (18, "z_peak_acc"),  (20, "x_peak_vel"),   (22, "y_peak_vel"),
        (24, "z_peak_vel"),
    ]),
    (4031, 2, [(0, "reboot_count")]),
    (4035, 2, [(0, "led_status")]),
    (4039, 2, [(0, "rpm")]),
]


def probe_modbus(
    host: str,
    port: int,
    unit_id: int,
    timeout: float = 3.0,
    register_groups: Optional[list] = None,
    auto_scan: bool = False,
) -> Dict[str, Any]:
    """
    Connect to a Modbus TCP device and read registers.

    Args:
        register_groups: Known register groups to read (VIBIT format).
                         If None, uses _VIBIT_REGISTER_GROUPS.
        auto_scan:       If True AND no register_groups provided, scan common
                         Modbus address ranges to discover responsive registers.
    """
    result: Dict[str, Any] = {
        "host": host,
        "port": port,
        "unit_id": unit_id,
        "connected": False,
        "registers_read": {},
        "auto_discovered_registers": [],
        "error": None,
    }

    try:
        from pymodbus.client import ModbusTcpClient
    except ImportError:
        result["error"] = "pymodbus not installed — pip install pymodbus"
        return result

    client = None
    try:
        client = ModbusTcpClient(host, port=port, timeout=timeout)
        connected = client.connect()
        result["connected"] = bool(connected)

        if not connected:
            result["error"] = "Modbus connect returned False"
            return result

        groups = register_groups if register_groups is not None else _VIBIT_REGISTER_GROUPS

        # Read known register groups
        for base, count, fields in groups:
            try:
                res = client.read_holding_registers(address=base, count=count, slave=unit_id)
                if res.isError():
                    for _, key in fields:
                        result["registers_read"][key] = {"error": str(res)}
                    continue
                regs = res.registers
                for offset, key in fields:
                    try:
                        raw = struct.pack(">HH", regs[offset + 1], regs[offset])
                        val = round(struct.unpack(">f", raw)[0], 4)
                        result["registers_read"][key] = val
                    except Exception as e:
                        result["registers_read"][key] = {"decode_error": str(e)}
            except Exception as e:
                for _, key in fields:
                    result["registers_read"][key] = {"read_error": str(e)}

        # Auto-scan mode: probe common register ranges to discover what exists
        if auto_scan:
            result["auto_discovered_registers"] = _modbus_auto_scan(client, unit_id)

    except Exception as e:
        result["error"] = str(e)
    finally:
        if client:
            try:
                client.close()
            except Exception:
                pass

    return result


def _modbus_auto_scan(client, unit_id: int) -> List[Dict[str, Any]]:
    """
    Scan common Modbus holding-register address ranges to find responsive
    registers on an unknown device.  Returns a list of discovered entries.

    Scans:
      • Coils             (FC01):   0-99
      • Discrete inputs   (FC02):   0-99
      • Holding registers (FC03):   0-99, 100-199, 200-299, 300-399,
                                    400-499, 1000-1099, 2000-2099,
                                    3000-3099, 4000-4099, 4100-4199,
                                    8000-8099, 9000-9099, 40001-40099
      • Input registers   (FC04):   0-99, 30001-30099
    """
    discovered = []

    # ── Holding registers (FC03) — most common ───────────────────────
    hr_ranges = [
        (0, 100), (100, 100), (200, 100), (300, 100), (400, 100),
        (1000, 100), (2000, 100), (3000, 100),
        (4000, 100), (4100, 100),
        (8000, 100), (9000, 100),
        (40001, 100),
    ]
    for start, count in hr_ranges:
        try:
            res = client.read_holding_registers(address=start, count=count, slave=unit_id)
            if not res.isError():
                for i, val in enumerate(res.registers):
                    if val != 0:  # only report non-zero to reduce noise
                        discovered.append({
                            "function": "FC03 (Holding Register)",
                            "address": start + i,
                            "raw_value": val,
                        })
        except Exception:
            pass

    # ── Input registers (FC04) ───────────────────────────────────────
    ir_ranges = [(0, 100), (30001, 100)]
    for start, count in ir_ranges:
        try:
            res = client.read_input_registers(address=start, count=count, slave=unit_id)
            if not res.isError():
                for i, val in enumerate(res.registers):
                    if val != 0:
                        discovered.append({
                            "function": "FC04 (Input Register)",
                            "address": start + i,
                            "raw_value": val,
                        })
        except Exception:
            pass

    # ── Coils (FC01) ─────────────────────────────────────────────────
    try:
        res = client.read_coils(address=0, count=100, slave=unit_id)
        if not res.isError():
            for i, val in enumerate(res.bits[:100]):
                if val:
                    discovered.append({
                        "function": "FC01 (Coil)",
                        "address": i,
                        "raw_value": val,
                    })
    except Exception:
        pass

    # ── Discrete inputs (FC02) ───────────────────────────────────────
    try:
        res = client.read_discrete_inputs(address=0, count=100, slave=unit_id)
        if not res.isError():
            for i, val in enumerate(res.bits[:100]):
                if val:
                    discovered.append({
                        "function": "FC02 (Discrete Input)",
                        "address": i,
                        "raw_value": val,
                    })
    except Exception:
        pass

    return discovered


# ═══════════════════════════════════════════════════════════════════════════════
# Pretty-print helpers
# ═══════════════════════════════════════════════════════════════════════════════

_CYAN    = "\033[96m"
_GREEN   = "\033[92m"
_RED     = "\033[91m"
_YELLOW  = "\033[93m"
_MAGENTA = "\033[95m"
_BOLD    = "\033[1m"
_DIM     = "\033[2m"
_RESET   = "\033[0m"

_SEP = "═" * 80


def _status_icon(ok: bool) -> str:
    return f"{_GREEN}●{_RESET}" if ok else f"{_RED}✖{_RESET}"


def _header(text: str):
    print(f"\n{_BOLD}{_CYAN}{_SEP}{_RESET}")
    print(f"{_BOLD}{_CYAN}  {text}{_RESET}")
    print(f"{_BOLD}{_CYAN}{_SEP}{_RESET}")


def _subheader(text: str):
    print(f"\n  {_BOLD}{_MAGENTA}── {text} ──{_RESET}")


def _kv(key: str, value, indent: int = 4):
    pad = " " * indent
    print(f"{pad}{_DIM}{key}:{_RESET} {value}")


def _tag_table(tags_dict: dict, indent: int = 6):
    """Print a nice table of tag entries."""
    pad = " " * indent
    for tag_name, info in tags_dict.items():
        direction = info.get("direction", "?")
        dtype = info.get("type", "?")
        desc = info.get("description", "")
        addr = info.get("node_id") or info.get("register", "")

        # Color-code direction
        if "WRITE" in direction:
            dir_color = _YELLOW
        else:
            dir_color = _GREEN

        print(
            f"{pad}{_BOLD}{tag_name:<25}{_RESET} "
            f"{dir_color}{direction:<22}{_RESET} "
            f"{_DIM}{dtype:<20}{_RESET} "
            f"{addr}"
        )
        if desc:
            print(f"{pad}  {_DIM}└─ {desc}{_RESET}")


# ═══════════════════════════════════════════════════════════════════════════════
# Main discovery routine
# ═══════════════════════════════════════════════════════════════════════════════

def discover_all(timeout: float = 5.0, json_output: bool = False):
    """Run connectivity and tag discovery on every configured machine."""

    timestamp = datetime.now().isoformat()
    report: Dict[str, Any] = {
        "timestamp": timestamp,
        "machines": [],
    }

    if not json_output:
        print(f"\n{_BOLD}{'═' * 80}{_RESET}")
        print(f"{_BOLD}  CoEDM — Machine Discovery & Diagnostics Report{_RESET}")
        print(f"{_BOLD}  {timestamp}{_RESET}")
        print(f"{_BOLD}{'═' * 80}{_RESET}")

    for machine in MACHINES:
        name = machine["name"]
        protocol = machine["protocol"]
        station = machine["station"]

        m_report: Dict[str, Any] = {
            "name": name,
            "station": station,
            "protocol": protocol,
            "connection": {},
            "communication_channels": [],
            "known_variables": {},
            "discovered_variables": [],
        }

        if not json_output:
            _header(f"{name}")
            _kv("Station", station)
            _kv("Protocol", protocol)

        # ── Determine endpoint and probe ──────────────────────────────────
        if protocol == "OPC-UA":
            url = machine["url"]()
            ns = machine["namespace"]()
            host, port = _parse_opcua_url(url)

            m_report["connection"]["url"] = url
            m_report["connection"]["namespace"] = ns

            if not json_output:
                _kv("Endpoint", url)
                _kv("Namespace", ns)

            # TCP probe first
            tcp_result = probe_tcp(host, port, timeout)
            m_report["connection"]["tcp_probe"] = tcp_result

            if not json_output:
                _subheader("TCP Connectivity")
                _kv("Reachable", f"{_status_icon(tcp_result['reachable'])}  {tcp_result.get('latency_ms', '-')} ms")
                if tcp_result.get("error"):
                    _kv("Error", f"{_RED}{tcp_result['error']}{_RESET}")

            # OPC-UA probe
            if tcp_result["reachable"]:
                if not json_output:
                    _subheader("OPC-UA Session")
                    print(f"      {_DIM}Connecting & browsing (up to {timeout}s)...{_RESET}")

                opcua_result = probe_opcua(url, timeout)
                m_report["connection"]["opcua_probe"] = {
                    "connected": opcua_result["connected"],
                    "server_info": opcua_result.get("server_info"),
                    "namespaces": opcua_result.get("namespaces", []),
                    "node_count": opcua_result.get("node_count", 0),
                    "error": opcua_result.get("error"),
                }
                m_report["discovered_variables"] = opcua_result.get("discovered_nodes", [])

                if not json_output:
                    _kv("Connected", _status_icon(opcua_result["connected"]))
                    if opcua_result.get("server_info"):
                        si = opcua_result["server_info"]
                        _kv("Server state", si.get("state", "?"))
                        if si.get("start_time"):
                            _kv("Start time", si["start_time"])
                    if opcua_result.get("namespaces"):
                        _kv("Namespaces", opcua_result["namespaces"])
                    if opcua_result.get("error"):
                        _kv("Error", f"{_RED}{opcua_result['error']}{_RESET}")

                    # Show discovered nodes summary
                    discovered = opcua_result.get("discovered_nodes", [])
                    if discovered:
                        _subheader(f"Discovered Nodes ({len(discovered)} found)")
                        variables = [n for n in discovered if "Variable" in n.get("node_class", "")]
                        objects = [n for n in discovered if "Object" in n.get("node_class", "")]
                        _kv("Variables", len(variables))
                        _kv("Objects/Folders", len(objects))

                        if variables:
                            print(f"\n      {'Name':<30} {'Node ID':<25} {'Type':<15} {'Value':<20} {'Writable'}")
                            print(f"      {'─'*30} {'─'*25} {'─'*15} {'─'*20} {'─'*8}")
                            for v in variables[:50]:  # cap display at 50
                                w_flag = f"{_YELLOW}✎ YES{_RESET}" if v.get("writable") else f"{_DIM}no{_RESET}"
                                val_str = str(v.get("current_value", ""))[:20]
                                print(
                                    f"      {v['browse_name']:<30} "
                                    f"{v['node_id']:<25} "
                                    f"{(v.get('data_type') or '?'):<15} "
                                    f"{val_str:<20} "
                                    f"{w_flag}"
                                )
                            if len(variables) > 50:
                                print(f"      {_DIM}... and {len(variables) - 50} more variables{_RESET}")

            # Communication channels
            channels = ["OPC-UA Binary (TCP)"]
            if tcp_result["reachable"]:
                channels.append("OPC-UA Subscription (data change callbacks)")
            m_report["communication_channels"] = channels

            if not json_output:
                _subheader("Communication Channels")
                for ch in channels:
                    print(f"      • {ch}")

        elif protocol == "Modbus TCP":
            host = machine["host"]()
            port = machine["port"]()
            uid = machine["unit_id"]()
            is_auto = machine.get("auto_discover", False)

            m_report["connection"]["host"] = host
            m_report["connection"]["port"] = port
            m_report["connection"]["unit_id"] = uid

            if not json_output:
                _kv("Endpoint", f"{host}:{port}")
                _kv("Unit ID", uid)
                if is_auto:
                    _kv("Mode", f"{_YELLOW}Auto-discover (no hardcoded registers){_RESET}")

            tcp_result = probe_tcp(host, port, timeout)
            m_report["connection"]["tcp_probe"] = tcp_result

            if not json_output:
                _subheader("TCP Connectivity")
                _kv("Reachable", f"{_status_icon(tcp_result['reachable'])}  {tcp_result.get('latency_ms', '-')} ms")
                if tcp_result.get("error"):
                    _kv("Error", f"{_RED}{tcp_result['error']}{_RESET}")

            if tcp_result["reachable"]:
                if not json_output:
                    if is_auto:
                        _subheader("Modbus Auto-Scan")
                        print(f"      {_DIM}Scanning coils, discrete inputs, holding & input registers...{_RESET}")
                    else:
                        _subheader("Modbus Register Read")
                        print(f"      {_DIM}Reading holding registers...{_RESET}")

                # For auto-discover machines, pass empty known groups + enable scan
                if is_auto:
                    modbus_result = probe_modbus(
                        host, port, uid, timeout,
                        register_groups=[],
                        auto_scan=True,
                    )
                else:
                    modbus_result = probe_modbus(host, port, uid, timeout)

                m_report["connection"]["modbus_probe"] = {
                    "connected": modbus_result["connected"],
                    "registers_read": modbus_result.get("registers_read", {}),
                    "auto_discovered_registers": modbus_result.get("auto_discovered_registers", []),
                    "error": modbus_result.get("error"),
                }
                m_report["discovered_variables"] = modbus_result.get("auto_discovered_registers", [])

                if not json_output:
                    _kv("Connected", _status_icon(modbus_result["connected"]))

                    # Known registers (VIBIT-style)
                    if modbus_result.get("registers_read"):
                        print(f"\n      {'Register':<20} {'Value'}")
                        print(f"      {'─'*20} {'─'*30}")
                        for k, v in modbus_result["registers_read"].items():
                            print(f"      {k:<20} {v}")

                    # Auto-discovered registers
                    auto_regs = modbus_result.get("auto_discovered_registers", [])
                    if auto_regs:
                        _subheader(f"Auto-Discovered Registers ({len(auto_regs)} non-zero)")
                        print(f"\n      {'Function':<30} {'Address':<12} {'Raw Value'}")
                        print(f"      {'─'*30} {'─'*12} {'─'*15}")
                        for entry in auto_regs[:80]:  # cap display
                            print(
                                f"      {entry['function']:<30} "
                                f"{entry['address']:<12} "
                                f"{entry['raw_value']}"
                            )
                        if len(auto_regs) > 80:
                            print(f"      {_DIM}... and {len(auto_regs) - 80} more registers{_RESET}")
                    elif is_auto and modbus_result["connected"]:
                        print(f"      {_DIM}No non-zero registers found in scanned ranges{_RESET}")

                    if modbus_result.get("error"):
                        _kv("Error", f"{_RED}{modbus_result['error']}{_RESET}")

            channels = ["Modbus TCP (holding registers — function code 0x03)"]
            if is_auto:
                channels.extend([
                    "Modbus TCP (input registers — function code 0x04)",
                    "Modbus TCP (coils — function code 0x01)",
                    "Modbus TCP (discrete inputs — function code 0x02)",
                ])
            m_report["communication_channels"] = channels

            if not json_output:
                _subheader("Communication Channels")
                for ch in channels:
                    print(f"      • {ch}")

        elif "TCP" in protocol:
            host = machine["host"]()
            port = machine["port"]()

            m_report["connection"]["host"] = host
            m_report["connection"]["port"] = port

            if not json_output:
                _kv("Endpoint", f"{host}:{port}")

            tcp_result = probe_tcp(host, port, timeout)
            m_report["connection"]["tcp_probe"] = tcp_result

            if not json_output:
                _subheader("TCP Connectivity")
                _kv("Reachable", f"{_status_icon(tcp_result['reachable'])}  {tcp_result.get('latency_ms', '-')} ms")
                if tcp_result.get("error"):
                    _kv("Error", f"{_RED}{tcp_result['error']}{_RESET}")

            channels = ["Raw TCP Socket (TMSCT protocol — TM Robot Script)"]
            m_report["communication_channels"] = channels

            if not json_output:
                _subheader("Communication Channels")
                for ch in channels:
                    print(f"      • {ch}")

        # ── Known tags / variables ────────────────────────────────────────
        known = machine.get("known_tags", {})
        m_report["known_variables"] = known

        if not json_output and known:
            _subheader("Known Variables & Tags")

            total_read = 0
            total_write = 0
            for group_name, tags in known.items():
                print(f"\n      {_BOLD}{group_name}{_RESET}")
                _tag_table(tags, indent=8)
                for _, info in tags.items():
                    d = info.get("direction", "")
                    if "WRITE" in d:
                        total_write += 1
                    if "READ" in d:
                        total_read += 1

            print(f"\n      {_DIM}Summary: {total_read} readable, {total_write} writable{_RESET}")

        report["machines"].append(m_report)

    # ── Grand summary ─────────────────────────────────────────────────────
    if not json_output:
        _header("Summary")
        for m in report["machines"]:
            tcp = m["connection"].get("tcp_probe", {})
            ok = tcp.get("reachable", False)
            lat = tcp.get("latency_ms", "-")
            print(
                f"    {_status_icon(ok)} {m['name']:<45} "
                f"{m['protocol']:<20} "
                f"{'ONLINE' if ok else 'OFFLINE':<10} "
                f"{lat} ms"
            )

        print(f"\n{_DIM}  Report generated at {timestamp}{_RESET}")
        print(f"{_BOLD}{'═' * 80}{_RESET}\n")
    else:
        # JSON mode — output machine-readable report
        print(json.dumps(report, indent=2, default=str))

    return report


# ═══════════════════════════════════════════════════════════════════════════════
# CLI entry point
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="CoEDM Machine Discovery — scan all configured machines",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/discover_machines.py                  Pretty-print report
  python scripts/discover_machines.py --json           JSON output
  python scripts/discover_machines.py --timeout 10     Longer timeout for slow networks
  python scripts/discover_machines.py --json > report.json
        """,
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output machine-readable JSON instead of pretty-print",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=5.0,
        help="Connection timeout in seconds (default: 5)",
    )

    args = parser.parse_args()
    discover_all(timeout=args.timeout, json_output=args.json)


if __name__ == "__main__":
    main()
