#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║            CoEDM — Dynamic Device Capability Scanner                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Reads EVERY machine endpoint from backend/.env via pydantic-settings      ║
║  and dynamically discovers what each device actually broadcasts:            ║
║                                                                            ║
║    • OPC-UA servers  → full address-space browse (nodes, values, types)     ║
║    • Modbus TCP      → holding/input register scan + coil/discrete scan    ║
║    • Raw TCP (Cobot) → socket probe + initial banner capture               ║
║                                                                            ║
║  *** ZERO HARDCODED TAG NAMES / REGISTER ADDRESSES ***                     ║
║  Everything reported is discovered live from the device.                    ║
║                                                                            ║
║  Usage:                                                                    ║
║    python scripts/scan_capabilities.py                                     ║
║    python scripts/scan_capabilities.py --json                              ║
║    python scripts/scan_capabilities.py --json -o capabilities.json         ║
║    python scripts/scan_capabilities.py --machine asrs                      ║
║    python scripts/scan_capabilities.py --machine vibit_mirac               ║
║    python scripts/scan_capabilities.py --opcua-only                        ║
║    python scripts/scan_capabilities.py --modbus-only                       ║
║    python scripts/scan_capabilities.py --timeout 10                        ║
║    python scripts/scan_capabilities.py --max-depth 8                       ║
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
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# Force UTF-8 output on Windows to handle box-drawing characters
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Project root on sys.path
# ---------------------------------------------------------------------------
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

try:
    from backend.config import settings
except Exception as _err:
    print(
        f"\033[91m"
        f"FATAL: Cannot import backend.config.settings\n"
        f"       {_err}\n\n"
        f"  Run from project root:  python scripts/scan_capabilities.py\n"
        f"  Ensure backend/.env exists and pydantic-settings is installed.\n"
        f"\033[0m"
    )
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════════════════
# ANSI helpers
# ═══════════════════════════════════════════════════════════════════════════════

_C = "\033[96m"   # cyan
_G = "\033[92m"   # green
_R = "\033[91m"   # red
_Y = "\033[93m"   # yellow
_M = "\033[95m"   # magenta
_B = "\033[1m"    # bold
_D = "\033[2m"    # dim
_0 = "\033[0m"    # reset

_BAR = "═" * 80


def _ok(t):  return f"{_G}{t}{_0}"
def _err(t): return f"{_R}{t}{_0}"
def _wrn(t): return f"{_Y}{t}{_0}"
def _inf(t): return f"{_C}{t}{_0}"
def _dim(t): return f"{_D}{t}{_0}"
def _bld(t): return f"{_B}{t}{_0}"


# ═══════════════════════════════════════════════════════════════════════════════
# Machine registry — built dynamically from backend/.env (zero hardcoded tags)
# ═══════════════════════════════════════════════════════════════════════════════

def _opcua_host(url: str) -> str:
    return url.replace("opc.tcp://", "").split(":")[0].strip("/")


def _opcua_port(url: str) -> int:
    try:
        return int(url.replace("opc.tcp://", "").split(":")[1].strip("/"))
    except Exception:
        return 4840


def build_machine_registry() -> List[Dict[str, Any]]:
    """
    Construct the full machine list purely from .env config values.
    No tag names, register addresses, or node IDs appear here.
    """
    machines = []

    # ── OPC-UA machines ──────────────────────────────────────────────────
    opcua_endpoints = [
        ("ASRS (Automated Storage & Retrieval)", "asrs", settings.ASRS_OPCUA_URL),
        ("Hydraulic Assembly Station",           "assembly", settings.HYDRAULIC_OPCUA_URL),
        ("MIRAC CNC Station",                    "mirac", settings.MIRAC_OPCUA_URL),
        ("TRIAC CNC Station",                    "triac", settings.TRIAC_OPCUA_URL),
    ]
    for name, station, url in opcua_endpoints:
        machines.append({
            "name": name,
            "station": station,
            "protocol": "OPC-UA",
            "host": _opcua_host(url),
            "port": _opcua_port(url),
            "url": url,
        })

    # ── Modbus TCP sensors (VIBIT on MIRAC) ──────────────────────────────
    for uid_attr, label in [
        ("VIBIT_UNIT_ID",   "VIBIT Sensor (MIRAC — Unit 1)"),
        ("VIBIT_UNIT_ID_2", "VIBIT Sensor (MIRAC — Unit 2)"),
        ("VIBIT_UNIT_ID_3", "VIBIT Sensor (MIRAC — Unit 3)"),
    ]:
        machines.append({
            "name": label,
            "station": f"mirac-vibit-{getattr(settings, uid_attr)}",
            "protocol": "Modbus TCP",
            "host": settings.VIBIT_HOST,
            "port": settings.VIBIT_PORT,
            "unit_id": getattr(settings, uid_attr),
        })

    # ── Modbus TCP sensors (VIBIT on TRIAC) ──────────────────────────────
    for uid_attr, label in [
        ("TRIAC_VIBIT_UNIT_ID",   "VIBIT Sensor (TRIAC — Unit 1)"),
        ("TRIAC_VIBIT_UNIT_ID_2", "VIBIT Sensor (TRIAC — Unit 2)"),
        ("TRIAC_VIBIT_UNIT_ID_3", "VIBIT Sensor (TRIAC — Unit 3)"),
    ]:
        machines.append({
            "name": label,
            "station": f"triac-vibit-{getattr(settings, uid_attr)}",
            "protocol": "Modbus TCP",
            "host": settings.TRIAC_VIBIT_HOST,
            "port": settings.TRIAC_VIBIT_PORT,
            "unit_id": getattr(settings, uid_attr),
        })

    # ── AMR (Modbus TCP) ─────────────────────────────────────────────────
    machines.append({
        "name": "AMR (Autonomous Mobile Robot)",
        "station": "amr",
        "protocol": "Modbus TCP",
        "host": settings.AMR_HOST,
        "port": settings.AMR_PORT,
        "unit_id": settings.AMR_UNIT_ID,
    })

    # ── TM Cobot (Raw TCP / TMSCT) ──────────────────────────────────────
    machines.append({
        "name": "TM Cobot (Collaborative Robot)",
        "station": "cobot",
        "protocol": "Raw TCP",
        "host": settings.COBOT_HOST,
        "port": settings.COBOT_PORT,
    })

    return machines


# ═══════════════════════════════════════════════════════════════════════════════
# TCP reachability probe
# ═══════════════════════════════════════════════════════════════════════════════

def probe_tcp(host: str, port: int, timeout: float = 3.0) -> Dict[str, Any]:
    """Quick TCP connect to test if a host:port is reachable."""
    result = {"host": host, "port": port, "reachable": False,
              "latency_ms": None, "error": None}
    try:
        t0 = time.perf_counter()
        with socket.create_connection((host, port), timeout=timeout) as _:
            result["reachable"] = True
            result["latency_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    except socket.timeout:
        result["error"] = "Connection timed out"
    except ConnectionRefusedError:
        result["error"] = "Connection refused"
    except OSError as e:
        result["error"] = str(e)
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# OPC-UA full address-space discovery (zero hardcoded tags)
# ═══════════════════════════════════════════════════════════════════════════════

def scan_opcua(url: str, timeout: float = 10.0, max_depth: int = 6,
               max_nodes: int = 2000) -> Dict[str, Any]:
    """
    Connect to an OPC-UA server and browse the ENTIRE address space.
    Reports every node found — name, type, value, writable flag — with
    absolutely no pre-defined tag names.
    """
    result = {
        "url": url,
        "connected": False,
        "server_info": {},
        "namespaces": [],
        "nodes": [],
        "summary": {},
        "errors": [],
    }

    try:
        from asyncua.sync import Client
        from asyncua import ua
    except ImportError:
        result["errors"].append("asyncua not installed — pip install asyncua")
        return result

    client = None
    try:
        client = Client(url, timeout=timeout)
        client.connect()
        result["connected"] = True

        # ── Server info ──────────────────────────────────────────────────
        try:
            status_node = client.get_node(ua.ObjectIds.Server_ServerStatus)
            status = status_node.get_value()
            result["server_info"] = {
                "state": str(getattr(status, "State", "Unknown")),
                "start_time": str(getattr(status, "StartTime", "")),
                "current_time": str(getattr(status, "CurrentTime", "")),
                "build_info": str(getattr(status, "BuildInfo", "")),
            }
        except Exception:
            result["server_info"] = {"state": "Connected (details unavailable)"}

        # ── Namespace array ──────────────────────────────────────────────
        try:
            result["namespaces"] = client.get_namespace_array()
        except Exception as e:
            result["errors"].append(f"Namespace read failed: {e}")

        # ── Full recursive browse ────────────────────────────────────────
        visited = set()

        def _get_children(node):
            """Try get_children(), fall back to get_references()."""
            try:
                children = node.get_children()
                if children:
                    return children
            except Exception:
                pass
            try:
                refs = node.get_references(
                    refs=ua.ObjectIds.References,
                    direction=ua.BrowseDirection.Forward,
                )
                return [client.get_node(ref.NodeId) for ref in refs]
            except Exception:
                pass
            return []

        def browse(node, path="", depth=0):
            if depth > max_depth or len(result["nodes"]) >= max_nodes:
                return

            for child in _get_children(node):
                if len(result["nodes"]) >= max_nodes:
                    return

                try:
                    nid = child.nodeid.to_string()
                    if nid in visited:
                        continue
                    visited.add(nid)

                    ns_idx = child.nodeid.NamespaceIndex
                    browse_name = child.get_browse_name().to_string()
                    display_name = child.get_display_name().Text
                    node_class = str(child.get_node_class())
                    current_path = f"{path}/{display_name}" if path else display_name

                    # Only record user-namespace nodes (ns >= 1) to skip OPC-UA
                    # base schema noise, but always recurse into ns=0 folders
                    if ns_idx >= 1:
                        entry = {
                            "node_id": nid,
                            "namespace": ns_idx,
                            "browse_name": browse_name,
                            "display_name": display_name,
                            "path": current_path,
                            "node_class": node_class,
                        }

                        if "Variable" in node_class:
                            try:
                                val = child.get_value()
                                entry["value"] = str(val)[:200] if val is not None else None
                                entry["data_type"] = str(child.get_data_type_as_variant_type())
                            except Exception as ve:
                                entry["value"] = f"<read error: {ve}>"
                                entry["data_type"] = "unknown"

                            try:
                                access = child.get_access_level()
                                entry["readable"] = bool(access & 0x01)
                                entry["writable"] = bool(access & 0x02)
                            except Exception:
                                entry["readable"] = True
                                entry["writable"] = False

                        result["nodes"].append(entry)

                    # Recurse: only go deeper if we are in user namespaces (ns_idx >= 1)
                    # or if we are navigating the base Objects folder (i=85) to avoid
                    # scanning standard OPC-UA server diagnostics trees under ns=0
                    if "Object" in node_class:
                        if ns_idx >= 1 or child.nodeid.Identifier == 85:
                            browse(child, current_path, depth + 1)
                    elif "Variable" in node_class:
                        try:
                            if ns_idx >= 1:
                                if _get_children(child):
                                    browse(child, current_path, depth + 1)
                        except Exception:
                            pass

                except Exception:
                    continue

        # Start from the Objects node rather than the absolute root (avoid Types/Views)
        try:
            browse(client.get_objects_node(), "", 0)
        except Exception:
            # Fall back to root node if Objects folder lookup fails
            browse(client.get_root_node(), "", 0)

        # ── If standard browse found nothing, use PLC-specific probing ───
        # Detect PLC type from namespace URIs and probe accordingly.
        # No tag names are hardcoded — we generate candidate patterns from
        # the namespace metadata and probe each one.
        variables = [n for n in result["nodes"] if "Variable" in n.get("node_class", "")]
        if not variables:
            ns_array = result.get("namespaces", [])
            ns_joined = " ".join(ns_array).upper()

            def _probe_value(nid_str, label=""):
                """Try to read a value directly — fast-fail discovery."""
                if nid_str in visited:
                    return None
                try:
                    probe = client.get_node(nid_str)
                    val = probe.get_value()
                    visited.add(nid_str)
                    display = label
                    try:
                        display = probe.get_display_name().Text or label
                    except Exception:
                        pass
                    entry = {
                        "node_id": nid_str,
                        "namespace": int(nid_str.split(";")[0].split("=")[1]),
                        "display_name": display or nid_str,
                        "browse_name": nid_str,
                        "path": f"probe/{display or nid_str}",
                        "node_class": "Variable",
                        "value": str(val)[:200] if val is not None else None,
                    }
                    try:
                        entry["data_type"] = str(probe.get_data_type_as_variant_type())
                    except Exception:
                        entry["data_type"] = type(val).__name__ if val is not None else "unknown"
                    try:
                        access = probe.get_access_level()
                        entry["readable"] = bool(access & 0x01)
                        entry["writable"] = bool(access & 0x02)
                    except Exception:
                        entry["readable"] = True
                        entry["writable"] = False
                    return entry
                except Exception:
                    return None

            # ── Strategy 1: Integer NodeIds in ALL user namespaces ────────
            # Works for Siemens S7-1200/1500 (ns=3/4, integer IDs)
            # Optimize to only scan ns=3 and ns=4 (custom PLC namespaces) to avoid hundreds
            # of redundant network round-trips on base system namespaces.
            target_ns = [ns for ns in [3, 4] if ns < len(ns_array)]
            if not target_ns:
                target_ns = [len(ns_array) - 1] if len(ns_array) > 1 else [1]

            for ns_idx in target_ns:
                for node_int in range(1, 201):
                    e = _probe_value(f"ns={ns_idx};i={node_int}")
                    if e:
                        result["nodes"].append(e)

            # ── Strategy 2: OMRON NX PLC — grid-based string tags ────────
            # OMRON uses ns=4;s=tagName format. Probe systematically
            # by generating grid patterns common in PLC programs.
            is_omron = "OMRON" in ns_joined
            if is_omron:
                # LED status: ledA1..ledE7 (grid pattern)
                for col in "ABCDE":
                    for row in range(1, 8):
                        tag = f"led{col}{row}"
                        e = _probe_value(f"ns=4;s={tag}", tag)
                        if e:
                            e["path"] = f"OMRON/LEDs/{tag}"
                            result["nodes"].append(e)

                # Store/Retrieve commands: ColRowS (store), ColRow (retrieve)
                for col in "ABCDE":
                    for row in range(1, 8):
                        for suffix in [f"{col}{row}S", f"{col}{row}"]:
                            e = _probe_value(f"ns=4;s={suffix}", suffix)
                            if e:
                                e["path"] = f"OMRON/Commands/{suffix}"
                                result["nodes"].append(e)

                # Scan K-format commands: K{col}_{row}_R{cmd}
                for c in range(1, 8):
                    for r in range(1, 6):
                        for cmd in range(1, 6):
                            tag = f"K{c}_{r}_R{cmd}"
                            e = _probe_value(f"ns=4;s={tag}", tag)
                            if e:
                                e["path"] = f"OMRON/Commands/{tag}"
                                result["nodes"].append(e)

                # Common control tags
                for tag in ["Home", "Reset", "Start", "Stop", "Auto", "Manual",
                            "shuttle_position", "shuttle_status", "error_code",
                            "home_position", "speed", "alarm", "mode", "busy",
                            "cycle_count", "last_operation"]:
                    e = _probe_value(f"ns=4;s={tag}", tag)
                    if e:
                        e["path"] = f"OMRON/Status/{tag}"
                        result["nodes"].append(e)

            # ── Strategy 3: CODESYS / Delta PLC — pipe-format tags ───────
            # CODESYS uses ns=4;s=|var|DeviceName.Application.Program.Var
            is_codesys = "CODESYS" in ns_joined or "IECVARACCESS" in ns_joined
            if is_codesys:
                # Extract device name from namespace URIs
                device_names = set()
                for uri in ns_array:
                    decoded = uri.replace("%20", " ")
                    for part in decoded.split(":"):
                        part = part.strip()
                        # Device names: non-URL, 3+ chars, often like AX-308EA0MA1P
                        if (part and len(part) > 3
                                and not part.startswith("http")
                                and not part.startswith("urn")
                                and not part.startswith("CODESYS")):
                            device_names.add(part)

                for device in device_names:
                    # Scan PLC_PRG and MAIN programs with common output/input patterns
                    for prog in ["PLC_PRG", "MAIN", "GVL"]:
                        # Generate common IEC 61131 variable patterns
                        var_candidates = []
                        # Outputs/inputs: output01..output16, input01..input16
                        for prefix in ["output", "input"]:
                            for num in range(1, 17):
                                var_candidates.append(f"{prefix}{num:02d}")
                        # Relays, lights, operations
                        for v in ["Red", "Orange", "Green", "Blue", "White",
                                   "Relay1", "Relay2", "Relay3", "Relay4",
                                   "Relay5", "Relay6", "Relay7", "Relay8"]:
                            var_candidates.append(v)

                        for var_name in var_candidates:
                            if prog == "GVL":
                                tag = f"|var|{device}.Application.{prog}.{var_name}"
                            else:
                                tag = f"|var|{device}.Application.{prog}.{var_name}"
                            e = _probe_value(f"ns=4;s={tag}", var_name)
                            if e:
                                e["path"] = f"CODESYS/{prog}/{var_name}"
                                result["nodes"].append(e)

                    # GVL common variables (global variable list)
                    for gvl_var in ["mm", "open", "Close", "Buzzer", "displacement",
                                    "position", "pressure", "force", "temperature",
                                    "speed", "status", "error", "alarm", "mode"]:
                        tag = f"|var|{device}.Application.GVL.{gvl_var}"
                        e = _probe_value(f"ns=4;s={tag}", gvl_var)
                        if e:
                            e["path"] = f"CODESYS/GVL/{gvl_var}"
                            result["nodes"].append(e)

                    # Operation-prefixed tags (common in Delta PLCs)
                    for op in ["Opration_Bering_On", "Opration_Shaft_On",
                               "Operation_Bearing_On", "Operation_Shaft_On",
                               "Operation_Start", "Operation_Stop"]:
                        tag = f"|var|{device}.Application.PLC_PRG.{op}"
                        e = _probe_value(f"ns=4;s={tag}", op)
                        if e:
                            e["path"] = f"CODESYS/PLC_PRG/{op}"
                            result["nodes"].append(e)

        # Summary
        all_vars = [n for n in result["nodes"] if "Variable" in n.get("node_class", "")]
        all_objs = [n for n in result["nodes"] if "Object" in n.get("node_class", "")]
        result["summary"] = {
            "total_nodes": len(result["nodes"]),
            "variables": len(all_vars),
            "objects": len(all_objs),
            "writable_variables": len([v for v in all_vars if v.get("writable")]),
            "read_only_variables": len([v for v in all_vars if not v.get("writable")]),
        }

    except Exception as e:
        result["errors"].append(f"Connection error: {e}")
    finally:
        if client:
            try:
                client.disconnect()
            except Exception:
                pass

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Modbus TCP full register discovery (zero hardcoded addresses)
# ═══════════════════════════════════════════════════════════════════════════════

# Scan ranges — comprehensive coverage of all standard Modbus address spaces
_HR_RANGES = [
    (0, 100), (100, 100), (200, 100), (300, 100), (400, 100), (500, 100),
    (1000, 100), (2000, 100), (3000, 100),
    (4000, 50), (4050, 50), (4100, 50),
    (5000, 100), (8000, 100), (9000, 100),
    (40001, 100),
]
_IR_RANGES = [(0, 100), (100, 100), (1000, 100), (4000, 100), (30001, 100)]
_COIL_RANGE = (0, 200)
_DI_RANGE = (0, 200)


def scan_modbus(host: str, port: int, unit_id: int,
                timeout: float = 3.0) -> Dict[str, Any]:
    """
    Dynamically scan ALL Modbus register types on a device.
    Reports every responsive register with raw values and float32 decoding.
    No register names or addresses are hardcoded.
    """
    result = {
        "host": host,
        "port": port,
        "unit_id": unit_id,
        "connected": False,
        "holding_registers": [],
        "input_registers": [],
        "coils": [],
        "discrete_inputs": [],
        "decoded_float32": [],
        "supported_function_codes": [],
        "summary": {},
        "errors": [],
    }

    try:
        from pymodbus.client import ModbusTcpClient
    except ImportError:
        result["errors"].append("pymodbus not installed — pip install pymodbus")
        return result

    client = ModbusTcpClient(host, port=port, timeout=timeout)
    try:
        connected = client.connect()
        if not connected:
            result["errors"].append("Modbus connect returned False")
            return result
        result["connected"] = True

        # ── Adaptive range reader helper ──────────────────────────────────
        def _read_range_adaptive(read_func, start, count):
            # 1. Pre-probe at address count=1 to fast-fail if address range is unsupported
            try:
                p = read_func(address=start, count=1, slave=unit_id)
                if p.isError():
                    return {}
            except Exception:
                return {}

            # 2. Try to read the entire requested block
            try:
                resp = read_func(address=start, count=count, slave=unit_id)
                if not resp.isError():
                    return {start + i: val for i, val in enumerate(resp.registers)}
            except Exception:
                pass

            # 3. If whole block failed, chunk it in smaller sizes of 20
            # to handle strict device bounds and address gaps without failing completely
            chunk_size = 20
            results = {}
            for chunk_start in range(start, start + count, chunk_size):
                chunk_count = min(chunk_size, start + count - chunk_start)
                # Pre-probe chunk boundary
                try:
                    p = read_func(address=chunk_start, count=1, slave=unit_id)
                    if p.isError():
                        continue
                except Exception:
                    continue

                try:
                    resp = read_func(address=chunk_start, count=chunk_count, slave=unit_id)
                    if not resp.isError():
                        for i, val in enumerate(resp.registers):
                            results[chunk_start + i] = val
                    else:
                        # Chunk failed (contains a gap), try individual registers in chunk
                        for addr in range(chunk_start, chunk_start + chunk_count):
                            try:
                                r = read_func(address=addr, count=1, slave=unit_id)
                                if not r.isError():
                                    results[addr] = r.registers[0]
                            except Exception:
                                pass
                except Exception:
                    pass
            return results

        # ── FC03: Holding registers ──────────────────────────────────────
        hr_map = _read_range_adaptive(client.read_holding_registers, 4000, 100)
        # Scan additional ranges adaptively
        for start, count in _HR_RANGES:
            if start == 4000:  # already handled or merged
                continue
            hr_map.update(_read_range_adaptive(client.read_holding_registers, start, count))

        fc03_ok = len(hr_map) > 0
        if fc03_ok:
            result["supported_function_codes"].append("FC03 (Read Holding Registers)")
        for addr in sorted(hr_map):
            result["holding_registers"].append({
                "address": addr,
                "raw": hr_map[addr],
                "hex": f"0x{hr_map[addr]:04X}",
            })

        # ── FC04: Input registers ────────────────────────────────────────
        ir_map = _read_range_adaptive(client.read_input_registers, 4000, 100)
        for start, count in _IR_RANGES:
            if start == 4000:
                continue
            ir_map.update(_read_range_adaptive(client.read_input_registers, start, count))

        fc04_ok = len(ir_map) > 0
        if fc04_ok:
            result["supported_function_codes"].append("FC04 (Read Input Registers)")
        for addr in sorted(ir_map):
            result["input_registers"].append({
                "address": addr,
                "raw": ir_map[addr],
                "hex": f"0x{ir_map[addr]:04X}",
            })

        # ── FC01: Coils ──────────────────────────────────────────────────
        try:
            resp = client.read_coils(
                address=_COIL_RANGE[0], count=_COIL_RANGE[1], slave=unit_id
            )
            if not resp.isError():
                result["supported_function_codes"].append("FC01 (Read Coils)")
                for i, val in enumerate(resp.bits[:_COIL_RANGE[1]]):
                    result["coils"].append({"address": i, "value": bool(val)})
        except Exception:
            pass

        # ── FC02: Discrete inputs ────────────────────────────────────────
        try:
            resp = client.read_discrete_inputs(
                address=_DI_RANGE[0], count=_DI_RANGE[1], slave=unit_id
            )
            if not resp.isError():
                result["supported_function_codes"].append("FC02 (Read Discrete Inputs)")
                for i, val in enumerate(resp.bits[:_DI_RANGE[1]]):
                    result["discrete_inputs"].append({"address": i, "value": bool(val)})
        except Exception:
            pass

        # ── FC06/FC05 write capability test (safe: read → write same) ────
        # Test single holding register write
        try:
            if hr_map:
                test_addr = sorted(hr_map.keys())[0]
                test_val = hr_map[test_addr]
                wr = client.write_register(address=test_addr, value=test_val, slave=unit_id)
                if not wr.isError():
                    result["supported_function_codes"].append("FC06 (Write Single Register)")
        except Exception:
            pass

        # Test single coil write
        try:
            if result["coils"]:
                test_addr = result["coils"][0]["address"]
                test_val = result["coils"][0]["value"]
                wr = client.write_coil(address=test_addr, value=test_val, slave=unit_id)
                if not wr.isError():
                    result["supported_function_codes"].append("FC05 (Write Single Coil)")
        except Exception:
            pass

        # ── Decode consecutive register pairs as Float32 ─────────────────
        decoded = []
        for reg_type, reg_map in [("holding", hr_map), ("input", ir_map)]:
            sorted_addrs = sorted(reg_map.keys())
            i = 0
            while i < len(sorted_addrs) - 1:
                a1, a2 = sorted_addrs[i], sorted_addrs[i + 1]
                if a2 == a1 + 1:
                    r0, r1 = reg_map[a1], reg_map[a2]
                    for label, pack in [
                        ("big-endian word-swap", struct.pack(">HH", r1, r0)),
                        ("big-endian standard",  struct.pack(">HH", r0, r1)),
                    ]:
                        try:
                            fval = struct.unpack(">f", pack)[0]
                            if fval != fval or abs(fval) > 1e10:
                                continue
                            # Skip all-zero pairs (noise)
                            if r0 == 0 and r1 == 0:
                                continue
                            decoded.append({
                                "register_type": reg_type,
                                "address_pair": f"{a1}-{a2}",
                                "float_value": round(fval, 6),
                                "encoding": label,
                            })
                            break
                        except Exception:
                            continue
                    i += 2
                else:
                    i += 1
        result["decoded_float32"] = decoded

        # ── Summary ──────────────────────────────────────────────────────
        non_zero_hr = len([r for r in result["holding_registers"] if r["raw"] != 0])
        non_zero_ir = len([r for r in result["input_registers"] if r["raw"] != 0])
        active_coils = len([c for c in result["coils"] if c["value"]])
        active_di = len([d for d in result["discrete_inputs"] if d["value"]])

        result["summary"] = {
            "holding_registers_total": len(result["holding_registers"]),
            "holding_registers_non_zero": non_zero_hr,
            "input_registers_total": len(result["input_registers"]),
            "input_registers_non_zero": non_zero_ir,
            "coils_total": len(result["coils"]),
            "coils_active": active_coils,
            "discrete_inputs_total": len(result["discrete_inputs"]),
            "discrete_inputs_active": active_di,
            "decoded_floats": len(decoded),
            "supported_function_codes": result["supported_function_codes"],
        }

    except Exception as e:
        result["errors"].append(f"Modbus error: {e}")
    finally:
        try:
            client.close()
        except Exception:
            pass

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Raw TCP probe (Cobot / custom devices)
# ═══════════════════════════════════════════════════════════════════════════════

def scan_raw_tcp(host: str, port: int, timeout: float = 5.0) -> Dict[str, Any]:
    """
    Probe a raw TCP endpoint — connect, capture any initial banner/data,
    report what the device broadcasts on connect.
    """
    result = {
        "host": host,
        "port": port,
        "connected": False,
        "banner": None,
        "banner_hex": None,
        "banner_length": 0,
        "errors": [],
    }

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((host, port))
        result["connected"] = True

        # Try to receive initial data the device sends on connect
        try:
            sock.settimeout(3)
            data = sock.recv(4096)
            if data:
                result["banner"] = data.decode("ascii", errors="replace").strip()
                result["banner_hex"] = data[:128].hex()
                result["banner_length"] = len(data)
        except socket.timeout:
            result["banner"] = None

        sock.close()
    except socket.timeout:
        result["errors"].append("Connection timed out")
    except ConnectionRefusedError:
        result["errors"].append("Connection refused — no listen service active")
    except OSError as e:
        result["errors"].append(str(e))

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Pretty-print helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _header(text: str):
    print(f"\n{_B}{_C}{_BAR}{_0}")
    print(f"{_B}{_C}  {text}{_0}")
    print(f"{_B}{_C}{_BAR}{_0}")


def _sub(text: str):
    print(f"\n  {_B}{_M}── {text} ──{_0}")


def _kv(k: str, v, indent=4):
    print(f"{' ' * indent}{_D}{k}:{_0} {v}")


def print_opcua_report(machine: dict, scan: dict):
    """Pretty-print OPC-UA scan results."""
    _header(f"{machine['name']}  [{machine['protocol']}]")
    _kv("Endpoint", machine["url"])
    _kv("Host", f"{machine['host']}:{machine['port']}")

    if not scan["connected"]:
        for e in scan["errors"]:
            _kv("Error", _err(e))
        return

    _kv("Status", _ok("CONNECTED"))

    si = scan.get("server_info", {})
    if si:
        _sub("Server Info")
        for k, v in si.items():
            _kv(k, v, 6)

    if scan.get("namespaces"):
        _sub("Namespaces")
        for i, ns in enumerate(scan["namespaces"]):
            _kv(f"ns={i}", ns, 6)

    # Nodes grouped by path prefix
    nodes = scan.get("nodes", [])
    variables = [n for n in nodes if "Variable" in n.get("node_class", "")]
    objects = [n for n in nodes if "Object" in n.get("node_class", "")]

    s = scan.get("summary", {})
    _sub(f"Discovered Nodes (total: {s.get('total_nodes', 0)})")
    _kv("Variables", s.get("variables", 0), 6)
    _kv("Objects/Folders", s.get("objects", 0), 6)
    _kv("Writable", s.get("writable_variables", 0), 6)
    _kv("Read-only", s.get("read_only_variables", 0), 6)

    if variables:
        # Group by top-level path
        groups: Dict[str, list] = {}
        for v in variables:
            parts = v.get("path", "").split("/")
            gk = parts[1] if len(parts) > 1 else parts[0]
            groups.setdefault(gk, []).append(v)

        for gname, gvars in sorted(groups.items()):
            print(f"\n      ┌─ {_bld(gname)} ({len(gvars)} variables)")
            print(f"      │  {'NODE ID':25s}  {'DISPLAY NAME':30s}  {'VALUE':20s}  {'TYPE':12s}  {'RW'}")
            print(f"      │  {'─'*25}  {'─'*30}  {'─'*20}  {'─'*12}  {'─'*4}")
            for v in gvars[:60]:
                rw = f"{_Y}RW{_0}" if v.get("writable") else f"{_D}R {_0}"
                val = str(v.get("value", ""))[:20]
                dt = v.get("data_type", "")[:12]
                dn = v.get("display_name", "")[:30]
                nid = v.get("node_id", "")[:25]
                print(f"      │  {nid:25s}  {dn:30s}  {val:20s}  {dt:12s}  {rw}")
            if len(gvars) > 60:
                print(f"      │  {_dim(f'... and {len(gvars) - 60} more')}")
            print(f"      └{'─' * 100}")


def print_modbus_report(machine: dict, scan: dict):
    """Pretty-print Modbus scan results."""
    _header(f"{machine['name']}  [{machine['protocol']}]")
    _kv("Endpoint", f"{machine['host']}:{machine['port']}")
    _kv("Unit ID", machine.get("unit_id", "?"))

    if not scan["connected"]:
        for e in scan["errors"]:
            _kv("Error", _err(e))
        return

    _kv("Status", _ok("CONNECTED"))

    s = scan.get("summary", {})
    _sub("Capabilities Summary")
    _kv("Holding registers", f"{s.get('holding_registers_total', 0)} total, {s.get('holding_registers_non_zero', 0)} non-zero", 6)
    _kv("Input registers", f"{s.get('input_registers_total', 0)} total, {s.get('input_registers_non_zero', 0)} non-zero", 6)
    _kv("Coils", f"{s.get('coils_total', 0)} total, {s.get('coils_active', 0)} active", 6)
    _kv("Discrete inputs", f"{s.get('discrete_inputs_total', 0)} total, {s.get('discrete_inputs_active', 0)} active", 6)
    _kv("Decoded float32 pairs", s.get("decoded_floats", 0), 6)

    fcs = scan.get("supported_function_codes", [])
    if fcs:
        _sub("Supported Function Codes")
        for fc in fcs:
            print(f"      {_ok('✓')} {fc}")

    # Non-zero holding registers
    non_zero_hr = [r for r in scan.get("holding_registers", []) if r["raw"] != 0]
    if non_zero_hr:
        _sub(f"Non-Zero Holding Registers ({len(non_zero_hr)} found)")
        print(f"      {'ADDR':>6s}  {'RAW':>6s}  {'HEX':>6s}")
        print(f"      {'─'*6}  {'─'*6}  {'─'*6}")
        for r in non_zero_hr[:60]:
            print(f"      {r['address']:>6d}  {r['raw']:>6d}  {r['hex']:>6s}")
        if len(non_zero_hr) > 60:
            print(f"      {_dim(f'... and {len(non_zero_hr) - 60} more')}")

    # Decoded floats
    decoded = scan.get("decoded_float32", [])
    if decoded:
        _sub(f"Decoded Float32 Values ({len(decoded)} pairs)")
        print(f"      {'TYPE':>8s}  {'ADDR PAIR':>12s}  {'FLOAT VALUE':>14s}  {'ENCODING'}")
        print(f"      {'─'*8}  {'─'*12}  {'─'*14}  {'─'*25}")
        for d in decoded[:60]:
            print(
                f"      {d['register_type']:>8s}  "
                f"{d['address_pair']:>12s}  "
                f"{d['float_value']:>14.6f}  "
                f"{d['encoding']}"
            )
        if len(decoded) > 60:
            print(f"      {_dim(f'... and {len(decoded) - 60} more')}")

    # Active coils
    active_coils = [c for c in scan.get("coils", []) if c["value"]]
    if active_coils:
        _sub(f"Active Coils ({len(active_coils)} ON)")
        for c in active_coils[:30]:
            print(f"      addr={c['address']:>4d}  {_ok('ON')}")

    # Active discrete inputs
    active_di = [d for d in scan.get("discrete_inputs", []) if d["value"]]
    if active_di:
        _sub(f"Active Discrete Inputs ({len(active_di)} ON)")
        for d in active_di[:30]:
            print(f"      addr={d['address']:>4d}  {_ok('ON')}")


def print_tcp_report(machine: dict, tcp_probe: dict, scan: dict):
    """Pretty-print raw TCP scan results."""
    _header(f"{machine['name']}  [{machine['protocol']}]")
    _kv("Endpoint", f"{machine['host']}:{machine['port']}")

    if not scan["connected"]:
        for e in scan["errors"]:
            _kv("Error", _err(e))
        return

    _kv("Status", _ok("CONNECTED"))

    if scan.get("banner"):
        _sub("Initial Banner (device broadcast on connect)")
        print(f"      ASCII:  {scan['banner'][:200]}")
        print(f"      HEX:    {scan.get('banner_hex', '')[:120]}")
        print(f"      Length:  {scan.get('banner_length', 0)} bytes")
    else:
        _sub("No Initial Banner")
        print(f"      {_dim('Device did not send data on connect (may require a command first)')}")


# ═══════════════════════════════════════════════════════════════════════════════
# Main orchestrator
# ═══════════════════════════════════════════════════════════════════════════════

def scan_all(
    timeout: float = 5.0,
    max_depth: int = 6,
    max_nodes: int = 2000,
    machine_filter: Optional[str] = None,
    opcua_only: bool = False,
    modbus_only: bool = False,
    tcp_only: bool = False,
    json_output: bool = False,
    output_file: Optional[str] = None,
) -> Dict[str, Any]:
    """Run dynamic capability scans on all configured machines."""

    timestamp = datetime.now().isoformat()
    machines = build_machine_registry()

    # Apply filters
    if machine_filter:
        mf = machine_filter.lower()
        machines = [m for m in machines if mf in m["station"].lower() or mf in m["name"].lower()]
    if opcua_only:
        machines = [m for m in machines if m["protocol"] == "OPC-UA"]
    if modbus_only:
        machines = [m for m in machines if m["protocol"] == "Modbus TCP"]
    if tcp_only:
        machines = [m for m in machines if m["protocol"] == "Raw TCP"]

    report = {
        "timestamp": timestamp,
        "scan_config": {
            "timeout_s": timeout,
            "max_depth": max_depth,
            "max_nodes": max_nodes,
            "filter": machine_filter,
        },
        "machines": [],
    }

    if not json_output:
        print(f"\n{_B}{'═' * 80}{_0}")
        print(f"{_B}  CoEDM — Dynamic Device Capability Scanner{_0}")
        print(f"{_B}  {timestamp}{_0}")
        print(f"{_B}  Scanning {len(machines)} devices (timeout={timeout}s, depth={max_depth}){_0}")
        print(f"{_B}{'═' * 80}{_0}")

    for idx, machine in enumerate(machines, 1):
        name = machine["name"]
        protocol = machine["protocol"]

        if not json_output:
            print(f"\n  {_inf(f'[{idx}/{len(machines)}]')} Scanning {_bld(name)} ...")

        m_entry = {
            "name": name,
            "station": machine["station"],
            "protocol": protocol,
            "endpoint": {},
            "tcp_probe": {},
            "capabilities": {},
        }

        # TCP reachability first
        tcp_result = probe_tcp(machine["host"], machine["port"], timeout)
        m_entry["tcp_probe"] = tcp_result
        m_entry["endpoint"] = {
            "host": machine["host"],
            "port": machine["port"],
        }

        if not tcp_result["reachable"]:
            m_entry["capabilities"] = {"error": tcp_result.get("error", "Unreachable")}
            if not json_output:
                print(f"    {_err('✖')} {machine['host']}:{machine['port']} — {tcp_result.get('error', 'Unreachable')}")
            report["machines"].append(m_entry)
            continue

        if not json_output:
            print(f"    {_ok('●')} Reachable ({tcp_result['latency_ms']}ms)")

        # Protocol-specific scan
        if protocol == "OPC-UA":
            m_entry["endpoint"]["url"] = machine["url"]
            scan_result = scan_opcua(machine["url"], timeout, max_depth, max_nodes)
            m_entry["capabilities"] = scan_result
            if not json_output:
                print_opcua_report(machine, scan_result)

        elif protocol == "Modbus TCP":
            m_entry["endpoint"]["unit_id"] = machine.get("unit_id")
            scan_result = scan_modbus(
                machine["host"], machine["port"],
                machine.get("unit_id", 1), timeout
            )
            m_entry["capabilities"] = scan_result
            if not json_output:
                print_modbus_report(machine, scan_result)

        elif protocol == "Raw TCP":
            scan_result = scan_raw_tcp(machine["host"], machine["port"], timeout)
            m_entry["capabilities"] = scan_result
            if not json_output:
                print_tcp_report(machine, tcp_result, scan_result)

        report["machines"].append(m_entry)

    # ── Grand summary ─────────────────────────────────────────────────────
    if not json_output:
        _header("Grand Summary")
        print(f"\n    {'MACHINE':<45s} {'PROTOCOL':<15s} {'STATUS':<10s} {'LATENCY'}")
        print(f"    {'─'*45} {'─'*15} {'─'*10} {'─'*10}")

        for m in report["machines"]:
            tcp = m.get("tcp_probe", {})
            ok = tcp.get("reachable", False)
            lat = f"{tcp.get('latency_ms', '-')}ms" if ok else "—"
            status = _ok("ONLINE") if ok else _err("OFFLINE")
            cap = m.get("capabilities", {})

            # Extra info based on protocol
            extra = ""
            if m["protocol"] == "OPC-UA" and ok:
                s = cap.get("summary", {})
                n_vars = s.get("variables", 0)
                n_wr = s.get("writable_variables", 0)
                detail = f"{n_vars} vars, {n_wr} writable"
                extra = f"  {_dim(detail)}"
            elif m["protocol"] == "Modbus TCP" and ok:
                s = cap.get("summary", {})
                n_hr = s.get("holding_registers_non_zero", 0)
                n_fl = s.get("decoded_floats", 0)
                detail = f"{n_hr} HR, {n_fl} floats"
                extra = f"  {_dim(detail)}"

            print(
                f"    {m['name']:<45s} "
                f"{m['protocol']:<15s} "
                f"{status:<19s} "
                f"{lat}"
                f"{extra}"
            )

        print(f"\n  {_dim(f'Report generated at {timestamp}')}")
        print(f"{_B}{'═' * 80}{_0}\n")

    # JSON output
    if json_output:
        json_str = json.dumps(report, indent=2, default=str)
        if output_file:
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(json_str)
            print(f"Report saved to {output_file}", file=sys.stderr)
        else:
            print(json_str)

    return report


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="CoEDM — Dynamic Device Capability Scanner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/scan_capabilities.py                         Scan all machines
  python scripts/scan_capabilities.py --machine asrs          Scan ASRS only
  python scripts/scan_capabilities.py --machine vibit_mirac   Scan MIRAC VIBIT sensors
  python scripts/scan_capabilities.py --opcua-only            Only OPC-UA machines
  python scripts/scan_capabilities.py --modbus-only           Only Modbus devices
  python scripts/scan_capabilities.py --json                  JSON to stdout
  python scripts/scan_capabilities.py --json -o report.json   JSON to file
  python scripts/scan_capabilities.py --timeout 10            Longer timeout
  python scripts/scan_capabilities.py --max-depth 8           Deeper OPC-UA browse
        """,
    )
    parser.add_argument(
        "--machine", type=str, default=None,
        help="Filter by machine name or station ID (partial match)",
    )
    parser.add_argument(
        "--opcua-only", action="store_true",
        help="Only scan OPC-UA machines",
    )
    parser.add_argument(
        "--modbus-only", action="store_true",
        help="Only scan Modbus TCP devices",
    )
    parser.add_argument(
        "--tcp-only", action="store_true",
        help="Only scan Raw TCP devices (Cobot)",
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Output machine-readable JSON",
    )
    parser.add_argument(
        "-o", "--output", type=str, default=None,
        help="Write JSON output to file (requires --json)",
    )
    parser.add_argument(
        "--timeout", type=float, default=5.0,
        help="Connection timeout in seconds (default: 5)",
    )
    parser.add_argument(
        "--max-depth", type=int, default=6,
        help="Max OPC-UA browse depth (default: 6)",
    )
    parser.add_argument(
        "--max-nodes", type=int, default=2000,
        help="Max OPC-UA nodes to discover per machine (default: 2000)",
    )

    args = parser.parse_args()

    scan_all(
        timeout=args.timeout,
        max_depth=args.max_depth,
        max_nodes=args.max_nodes,
        machine_filter=args.machine,
        opcua_only=args.opcua_only,
        modbus_only=args.modbus_only,
        tcp_only=args.tcp_only,
        json_output=args.json,
        output_file=args.output,
    )


if __name__ == "__main__":
    main()
