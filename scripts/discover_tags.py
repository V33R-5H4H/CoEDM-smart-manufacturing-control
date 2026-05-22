#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════╗
║                   CoEDM — Tag & Variable Discovery                  ║
║                                                                      ║
║  Connects to every known machine and auto-discovers ALL available    ║
║  tags, variables, and data points.  Nothing is hardcoded — the       ║
║  script browses each device's address space and prints what it       ║
║  finds.                                                              ║
║                                                                      ║
║  Usage:                                                              ║
║    python scripts/discover_tags.py                                   ║
║    python scripts/discover_tags.py --machine mirac                   ║
║    python scripts/discover_tags.py --machine vibit_mirac             ║
║    python scripts/discover_tags.py --opcua-only                      ║
║    python scripts/discover_tags.py --modbus-only                     ║
║    python scripts/discover_tags.py --json                            ║
╚══════════════════════════════════════════════════════════════════════╝
"""

import os, sys, json, time, struct, socket, argparse, textwrap
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

# ── Project root on sys.path so `backend.config` is importable ────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

try:
    from backend.config import settings
except Exception as e:
    print(f"[FATAL] Cannot import backend.config.settings: {e}")
    print("        Run from project root:  python scripts/discover_tags.py")
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def _banner(text: str):
    width = 72
    print()
    print("═" * width)
    print(f"  {text}")
    print("═" * width)


def _section(text: str):
    print(f"\n── {text} {'─' * max(0, 56 - len(text))}")


def _ping(host: str, port: int, timeout: float = 2.0) -> Tuple[bool, float]:
    """Quick TCP connect to check if host:port is reachable."""
    t0 = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        return False, 0.0


# ═══════════════════════════════════════════════════════════════════════════════
#  OPC-UA TAG DISCOVERY
# ═══════════════════════════════════════════════════════════════════════════════

def discover_opcua(name: str, url: str, max_depth: int = 6) -> Dict[str, Any]:
    """
    Browse the full OPC-UA address space and return every node with its
    current value.  No hardcoded tags — discovers everything.

    Strategy (handles Siemens S7-1200, CODESYS, Delta, etc.):
      1. Browse from Root node (i=84) downward — catches everything.
      2. Use get_references() for broader child discovery when
         get_children() returns nothing (some PLCs filter by ref type).
      3. Track visited nodes to avoid infinite loops on circular refs.
    """
    result = {
        "machine": name,
        "protocol": "OPC-UA",
        "url": url,
        "connected": False,
        "server_info": {},
        "namespaces": [],
        "nodes": [],
        "errors": [],
    }

    try:
        from asyncua.sync import Client
        from asyncua import ua
    except ImportError:
        result["errors"].append("asyncua not installed — pip install asyncua")
        return result

    # Extract host:port for a quick reachability check
    try:
        parts = url.split("//")[1].split(":")
        host = parts[0]
        port = int(parts[1].split("/")[0]) if len(parts) > 1 else 4840
    except Exception:
        host, port = url, 4840

    alive, latency = _ping(host, port)
    if not alive:
        result["errors"].append(f"Host {host}:{port} unreachable")
        return result

    client = None
    try:
        client = Client(url, timeout=10)
        client.connect()
        result["connected"] = True

        # Server info
        try:
            server_node = client.get_node("ns=0;i=2253")  # ServerStatus
            server_state = server_node.get_value()
            result["server_info"]["state"] = str(server_state)
        except Exception:
            pass

        # Namespace array
        ns_array = []
        try:
            ns_array = client.get_namespace_array()
            result["namespaces"] = ns_array
            print(f"  Namespaces: {ns_array}")
        except Exception as e:
            result["errors"].append(f"Failed to read namespaces: {e}")

        # Visited set: prevent re-visiting the same NodeId
        visited: set = set()

        def _get_children_broad(node):
            """Try get_children() first; fall back to get_references() for PLCs
            that restrict the default HierarchicalReferences filter."""
            try:
                children = node.get_children()
                if children:
                    return children
            except Exception:
                pass

            # Broader: ask for all forward references
            try:
                refs = node.get_references(
                    refs=ua.ObjectIds.References,
                    direction=ua.BrowseDirection.Forward,
                )
                return [client.get_node(ref.NodeId) for ref in refs]
            except Exception:
                pass

            return []

        def browse_node(node, path: str = "", depth: int = 0):
            if depth > max_depth:
                return

            children = _get_children_broad(node)

            for child in children:
                try:
                    nid_str = child.nodeid.to_string()

                    # Skip already-visited nodes (circular reference guard)
                    if nid_str in visited:
                        continue
                    visited.add(nid_str)

                    # Skip OPC-UA base namespace nodes (ns=0) to reduce noise,
                    # BUT still recurse into them to reach user namespaces.
                    ns_idx = child.nodeid.NamespaceIndex

                    browse_name = child.get_browse_name().to_string()
                    display_name = child.get_display_name().Text
                    node_class = child.get_node_class()
                    node_class_str = str(node_class)

                    current_path = f"{path}/{display_name}" if path else display_name

                    # Only record user-namespace nodes (ns >= 1) to keep output clean
                    if ns_idx >= 1:
                        entry = {
                            "node_id": nid_str,
                            "namespace": ns_idx,
                            "browse_name": browse_name,
                            "display_name": display_name,
                            "path": current_path,
                            "node_class": node_class_str,
                        }

                        # Try to read value for Variable nodes
                        if "Variable" in node_class_str:
                            try:
                                val = child.get_value()
                                data_type = child.get_data_type_as_variant_type()
                                entry["value"] = str(val) if val is not None else None
                                entry["data_type"] = str(data_type)
                                entry["writable"] = False
                                try:
                                    access = child.get_access_level()
                                    entry["writable"] = bool(access & 0x02)
                                except Exception:
                                    pass
                            except Exception as ve:
                                entry["value"] = f"<read error: {ve}>"

                        result["nodes"].append(entry)

                    # Always recurse — even into ns=0 objects, because user
                    # variables are often nested under standard folders
                    if "Object" in node_class_str:
                        browse_node(child, current_path, depth + 1)
                    elif "Variable" in node_class_str:
                        # Complex variable types can have children
                        try:
                            sub_children = _get_children_broad(child)
                            if sub_children:
                                browse_node(child, current_path, depth + 1)
                        except Exception:
                            pass

                except Exception as e:
                    result["errors"].append(f"Error browsing child: {e}")

        print(f"  Browsing from Root (max depth {max_depth})...")

        # Start from the absolute Root (i=84) — this walks everything
        root_node = client.get_root_node()
        browse_node(root_node, "", 0)

        vars_found = len([n for n in result["nodes"] if "Variable" in n.get("node_class", "")])
        print(f"  Root browse found {vars_found} user-namespace variables")

        # If still empty, the PLCs likely have browse disabled but respond
        # to direct NodeId reads.  Brute-force scan using VALUE-FIRST
        # approach: try get_value() directly (avoids get_node_class()
        # failures on restricted PLCs).
        if vars_found == 0:
            print(f"  Root browse empty — PLCs may have browse restricted.")
            print(f"  Probing with value-first strategy...")

            def _probe_node_value(nid_str: str, label: str = "") -> Optional[dict]:
                """Try to read a value directly.  If it succeeds, the node exists
                and is a readable variable.  Much more reliable than get_node_class()
                on restricted PLCs (Siemens, OMRON)."""
                if nid_str in visited:
                    return None
                try:
                    probe = client.get_node(nid_str)
                    val = probe.get_value()  # Value-first: fast fail if not readable
                    visited.add(nid_str)

                    display = label
                    try:
                        display = probe.get_display_name().Text
                    except Exception:
                        pass

                    entry = {
                        "node_id": nid_str,
                        "namespace": int(nid_str.split(";")[0].split("=")[1]),
                        "display_name": display or nid_str,
                        "browse_name": nid_str,
                        "path": f"probe/{display or nid_str}",
                        "node_class": "Variable",
                        "value": str(val) if val is not None else None,
                    }

                    try:
                        entry["data_type"] = str(probe.get_data_type_as_variant_type())
                    except Exception:
                        entry["data_type"] = type(val).__name__ if val is not None else "unknown"

                    try:
                        access = probe.get_access_level()
                        entry["writable"] = bool(access & 0x02)
                    except Exception:
                        entry["writable"] = False

                    return entry
                except Exception:
                    return None

            # ── Strategy 1: Integer NodeIds in all user namespaces ────────
            # Siemens S7-1200 uses ns=3 or ns=4 with integer IDs (i=1..50+)
            print(f"  [1/3] Scanning integer NodeIds ns=1..{len(ns_array)-1}, i=1..200...")
            for ns_idx in range(1, len(ns_array)):
                ns_label = ns_array[ns_idx] if ns_idx < len(ns_array) else f"ns{ns_idx}"
                found_in_ns = 0

                for node_int_id in range(1, 201):
                    entry = _probe_node_value(f"ns={ns_idx};i={node_int_id}")
                    if entry:
                        result["nodes"].append(entry)
                        found_in_ns += 1

                if found_in_ns:
                    print(f"    ✓ ns={ns_idx}: {found_in_ns} readable variables")

            # ── Strategy 2: OMRON / ASRS string-based tags ────────────────
            # OMRON NX PLC uses ns=4;s=tagName format.
            # ASRS grid: LEDs (ledA1..ledE7), store/retrieve commands
            is_omron = any("OMRON" in ns for ns in ns_array)
            if is_omron:
                print(f"  [2/3] Probing OMRON/ASRS string tags (ns=4;s=...)...")
                letters = ["A", "B", "C", "D", "E"]
                numbers = range(1, 8)
                omron_found = 0

                # LED status nodes
                for L in letters:
                    for N in numbers:
                        tag = f"led{L}{N}"
                        entry = _probe_node_value(f"ns=4;s={tag}", tag)
                        if entry:
                            entry["path"] = f"ASRS/LEDs/{tag}"
                            result["nodes"].append(entry)
                            omron_found += 1

                # Store/Retrieve command nodes: K{col}_{row}_R{cmd}
                for col in range(1, 8):
                    for row in range(1, 6):
                        for cmd_idx in range(1, 6):
                            tag = f"K{col}_{row}_R{cmd_idx}"
                            entry = _probe_node_value(f"ns=4;s={tag}", tag)
                            if entry:
                                entry["path"] = f"ASRS/Commands/{tag}"
                                result["nodes"].append(entry)
                                omron_found += 1

                # Common OMRON variables
                for tag in [
                    "shuttle_position", "shuttle_status", "error_code",
                    "home_position", "speed", "alarm", "mode",
                    "cycle_count", "last_operation", "busy",
                ]:
                    entry = _probe_node_value(f"ns=4;s={tag}", tag)
                    if entry:
                        entry["path"] = f"ASRS/Status/{tag}"
                        result["nodes"].append(entry)
                        omron_found += 1

                if omron_found:
                    print(f"    ✓ OMRON tags: {omron_found} readable variables")
                else:
                    print(f"    ✗ No OMRON string tags found")

            # ── Strategy 3: Siemens S7-1200 specific tags ─────────────────
            is_siemens = any("SIMATIC" in ns or "siemens" in ns for ns in ns_array)
            if is_siemens:
                print(f"  [2/3] Probing Siemens S7-1200 tags...")
                siemens_found = 0

                # Siemens S7-1200 OPC-UA tags can use string NodeIds too
                for tag in [
                    "led_red", "led_yellow", "led_green",
                    "spindle_speed", "spindle_temp", "spindle_vibration",
                    "tool_number", "tool_temp", "tool_vibration",
                    "x_axis_value", "z_axis_value",
                    "x_axis_feed", "z_axis_feed",
                    "cycle_start", "cycle_stop", "pneumatic_chuck",
                    # Common DB names
                    '"DB1"', '"DB2"', '"DB3"', '"DB_Data"',
                    '"PLC_PRG"', '"Data_block_1"',
                ]:
                    for ns_idx in [3, 4]:
                        entry = _probe_node_value(f"ns={ns_idx};s={tag}", tag)
                        if entry:
                            entry["path"] = f"Siemens/{tag}"
                            result["nodes"].append(entry)
                            siemens_found += 1

                if siemens_found:
                    print(f"    ✓ Siemens tags: {siemens_found} readable variables")

            # ── Strategy 4: CODESYS pipe-format tags (Delta PLCs) ─────────
            codesys_prefixes = []
            for ns_uri in ns_array:
                if "CODESYS" in ns_uri or "IecVarAccess" in ns_uri:
                    codesys_prefixes.append(ns_uri)

            if codesys_prefixes:
                print(f"  [3/3] Probing CODESYS pipe-format tags...")
                # Extract device name from namespace URI
                device_names = set()
                for uri in ns_array:
                    for part in uri.replace('%20', ' ').split(':'):
                        part = part.strip()
                        if part and len(part) > 3 and not part.startswith('http') and not part.startswith('urn'):
                            device_names.add(part)

                codesys_found = 0
                for device in device_names:
                    for prog in ["PLC_PRG", "MAIN"]:
                        for var_suffix in [
                            "output01", "output02", "output03", "output04",
                            "output05", "output06", "output07", "output08",
                            "input01", "input02", "input03", "input04",
                            "Red", "Orange", "Green", "Relay1", "Relay2",
                            "Relay3", "Relay4",
                            "Opration_Bering_On", "Opration_Shaft_On",
                        ]:
                            tag = f"|var|{device}.Application.{prog}.{var_suffix}"
                            entry = _probe_node_value(f"ns=4;s={tag}", var_suffix)
                            if entry:
                                entry["path"] = f"CODESYS/{prog}/{var_suffix}"
                                result["nodes"].append(entry)
                                codesys_found += 1

                    for gvl_var in ["mm", "open", "Close", "Buzzer",
                                    "displacement", "position"]:
                        tag = f"|var|{device}.Application.GVL.{gvl_var}"
                        entry = _probe_node_value(f"ns=4;s={tag}", gvl_var)
                        if entry:
                            entry["path"] = f"CODESYS/GVL/{gvl_var}"
                            result["nodes"].append(entry)
                            codesys_found += 1

                if codesys_found:
                    print(f"    ✓ CODESYS tags: {codesys_found} readable variables")

            final_vars = len([n for n in result["nodes"] if "Variable" in n.get("node_class", "")])
            print(f"  Total variables found after probing: {final_vars}")

    except Exception as e:
        result["errors"].append(f"Connection failed: {e}")
    finally:
        if client:
            try:
                client.disconnect()
            except Exception:
                pass

    return result


def print_opcua_result(result: Dict[str, Any]):
    """Pretty-print OPC-UA discovery results."""
    _section(f"{result['machine']} — {result['url']}")

    if not result["connected"]:
        for err in result["errors"]:
            print(f"  ✗ {err}")
        return

    print(f"  ✓ Connected")

    # Categorize nodes
    variables = [n for n in result["nodes"] if "Variable" in n.get("node_class", "")]
    objects = [n for n in result["nodes"] if "Object" in n.get("node_class", "")]

    print(f"  Found: {len(variables)} variables, {len(objects)} object folders")

    if variables:
        # Group by top-level path component
        groups: Dict[str, list] = {}
        for v in variables:
            parts = v["path"].split("/")
            group_key = parts[1] if len(parts) > 1 else parts[0]
            groups.setdefault(group_key, []).append(v)

        for group_name, nodes in sorted(groups.items()):
            print(f"\n  ┌─ {group_name} ({len(nodes)} variables)")
            for node in nodes:
                val = node.get("value", "")
                dt = node.get("data_type", "")
                rw = "RW" if node.get("writable") else "R "
                nid = node.get("node_id", "")
                display = node.get("display_name", "")
                path = node.get("path", "")

                # Truncate long values
                val_str = str(val)[:50] if val else "—"

                print(f"  │  [{rw}] {nid:25s}  {display:30s}  = {val_str:20s}  ({dt})")
            print(f"  └{'─' * 60}")


# ═══════════════════════════════════════════════════════════════════════════════
#  VIBIT REGISTER MAP — labels for known VIBIT vibration sensor addresses
# ═══════════════════════════════════════════════════════════════════════════════

# Each pair of registers decodes as a float32 (big-endian word-swap).
# Base address for all VIBIT data is 4000 (using 0-indexed offsets below).
VIBIT_REGISTER_MAP = {
    "4000-4001": "x_rms_acceleration (mm/s²)",
    "4002-4003": "y_rms_acceleration (mm/s²)",
    "4004-4005": "z_rms_acceleration (mm/s²)",
    "4006-4007": "x_rms_velocity (mm/s)",
    "4008-4009": "y_rms_velocity (mm/s)",
    "4010-4011": "z_rms_velocity (mm/s)",
    "4012-4013": "temperature (°C)",
    "4014-4015": "x_peak_acceleration (mm/s²)",
    "4016-4017": "y_peak_acceleration (mm/s²)",
    "4018-4019": "z_peak_acceleration (mm/s²)",
    "4020-4021": "x_peak_velocity (mm/s)",
    "4022-4023": "y_peak_velocity (mm/s)",
    "4024-4025": "z_peak_velocity (mm/s)",
    "4026-4027": "(reserved)",
    "4028-4029": "(reserved)",
    "4030-4031": "reboot_count",
    "4032-4033": "(reserved)",
    "4034-4035": "led_status (1.0=green)",
    "4038-4039": "calculated_rpm",
}


def _label_for_addr_pair(addr_pair: str) -> str:
    """Look up a human-readable label for a Modbus register pair."""
    return VIBIT_REGISTER_MAP.get(addr_pair, "")


# ═══════════════════════════════════════════════════════════════════════════════
#  MODBUS TCP REGISTER DISCOVERY
# ═══════════════════════════════════════════════════════════════════════════════

def discover_modbus(name: str, host: str, port: int = 502, unit_id: int = 1,
                    scan_ranges: List[Tuple[int, int]] = None) -> Dict[str, Any]:
    """
    Scan Modbus holding registers to find all registers that return valid
    data.  No hardcoded register addresses — scans predefined ranges.
    """
    result = {
        "machine": name,
        "protocol": "Modbus TCP",
        "host": host,
        "port": port,
        "unit_id": unit_id,
        "connected": False,
        "registers": [],
        "decoded_floats": [],
        "errors": [],
    }

    try:
        from pymodbus.client import ModbusTcpClient
    except ImportError:
        result["errors"].append("pymodbus not installed — pip install pymodbus")
        return result

    alive, latency = _ping(host, port)
    if not alive:
        result["errors"].append(f"Host {host}:{port} unreachable")
        return result

    # Default scan ranges for VIBIT-type sensors and generic Modbus devices
    if scan_ranges is None:
        scan_ranges = [
            # Common VIBIT / IIoT sensor ranges
            (0, 50),          # Low registers (config, status)
            (100, 50),        # Mid registers
            (999, 50),        # Sometimes used for IDs
            (4000, 50),       # VIBIT vibration data typically starts here
            (4050, 50),       # Extended VIBIT registers
            (4096, 20),       # Some sensors use 4096+
            # Standard Modbus ranges
            (0, 100),         # Holding registers 0-99
            (100, 100),       # Holding registers 100-199
            (200, 100),       # Holding registers 200-299
            (300, 100),       # Holding registers 300-399
            (400, 100),       # Holding registers 400-499
            (1000, 100),      # Holding registers 1000-1099
            (2000, 100),      # Holding registers 2000-2099
            (3000, 100),      # Holding registers 3000-3099
        ]
        # De-duplicate overlapping ranges
        seen = set()
        unique_ranges = []
        for start, count in scan_ranges:
            key = (start, count)
            if key not in seen:
                seen.add(key)
                unique_ranges.append(key)
        scan_ranges = unique_ranges

    client = ModbusTcpClient(host, port=port, timeout=3)

    try:
        connected = client.connect()
        if not connected:
            result["errors"].append(f"Modbus connect returned False")
            return result

        result["connected"] = True
        print(f"  ✓ Connected to {host}:{port} (unit {unit_id})")

        found_registers = {}

        for start_addr, count in scan_ranges:
            try:
                resp = client.read_holding_registers(
                    address=start_addr,
                    count=count,
                    slave=unit_id,
                )
                if resp.isError():
                    continue  # This range doesn't exist — skip silently

                for i, val in enumerate(resp.registers):
                    addr = start_addr + i
                    if addr not in found_registers:
                        found_registers[addr] = val

            except Exception:
                continue

        # Sort by address
        for addr in sorted(found_registers.keys()):
            raw = found_registers[addr]
            result["registers"].append({
                "address": addr,
                "raw_value": raw,
                "hex": f"0x{raw:04X}",
            })

        # Try to decode consecutive register pairs as float32 (word-swapped, big-endian)
        sorted_addrs = sorted(found_registers.keys())
        decoded = []
        i = 0
        while i < len(sorted_addrs) - 1:
            a1 = sorted_addrs[i]
            a2 = sorted_addrs[i + 1]
            if a2 == a1 + 1:
                r0 = found_registers[a1]
                r1 = found_registers[a2]

                # Try both byte orderings
                for swap_label, pack in [
                    ("big-endian word-swap", struct.pack(">HH", r1, r0)),
                    ("big-endian standard", struct.pack(">HH", r0, r1)),
                ]:
                    try:
                        fval = struct.unpack(">f", pack)[0]
                        # Sanity check: skip NaN, Inf, and unreasonable values
                        if fval != fval or abs(fval) > 1e10 or abs(fval) < 1e-10:
                            continue
                        decoded.append({
                            "address_pair": f"{a1}-{a2}",
                            "float_value": round(fval, 4),
                            "encoding": swap_label,
                        })
                        break  # Only take the first valid decoding
                    except Exception:
                        continue
                i += 2  # Skip the pair
            else:
                i += 1

        result["decoded_floats"] = decoded

        # Also try reading input registers (read-only sensor data on some devices)
        input_regs = {}
        for start_addr, count in scan_ranges:
            try:
                resp = client.read_input_registers(
                    address=start_addr,
                    count=count,
                    slave=unit_id,
                )
                if not resp.isError():
                    for i, val in enumerate(resp.registers):
                        addr = start_addr + i
                        if addr not in input_regs:
                            input_regs[addr] = val
            except Exception:
                continue

        if input_regs:
            result["input_registers"] = [
                {"address": a, "raw_value": v, "hex": f"0x{v:04X}"}
                for a, v in sorted(input_regs.items())
            ]

            # Decode input register pairs as float32 too
            ir_sorted = sorted(input_regs.keys())
            ir_decoded = []
            j = 0
            while j < len(ir_sorted) - 1:
                a1 = ir_sorted[j]
                a2 = ir_sorted[j + 1]
                if a2 == a1 + 1:
                    r0 = input_regs[a1]
                    r1 = input_regs[a2]
                    for swap_label, pack in [
                        ("big-endian word-swap", struct.pack(">HH", r1, r0)),
                        ("big-endian standard", struct.pack(">HH", r0, r1)),
                    ]:
                        try:
                            fval = struct.unpack(">f", pack)[0]
                            if fval != fval or abs(fval) > 1e10 or abs(fval) < 1e-10:
                                continue
                            ir_decoded.append({
                                "address_pair": f"{a1}-{a2}",
                                "float_value": round(fval, 4),
                                "encoding": swap_label,
                            })
                            break
                        except Exception:
                            continue
                    j += 2
                else:
                    j += 1
            if ir_decoded:
                result["input_decoded_floats"] = ir_decoded

        # Try reading coils (boolean outputs)
        coils = {}
        for start_addr, count in [(0, 100)]:
            try:
                resp = client.read_coils(
                    address=start_addr,
                    count=count,
                    slave=unit_id,
                )
                if not resp.isError():
                    for i, val in enumerate(resp.bits[:count]):
                        if val:  # Only report active coils
                            coils[start_addr + i] = val
            except Exception:
                continue

        if coils:
            result["active_coils"] = [
                {"address": a, "value": bool(v)}
                for a, v in sorted(coils.items())
            ]

    except Exception as e:
        result["errors"].append(f"Modbus error: {e}")
    finally:
        try:
            client.close()
        except Exception:
            pass

    return result


def print_modbus_result(result: Dict[str, Any]):
    """Pretty-print Modbus discovery results."""
    _section(f"{result['machine']} — {result['host']}:{result['port']} (unit {result['unit_id']})")

    if not result["connected"]:
        for err in result["errors"]:
            print(f"  ✗ {err}")
        return

    print(f"  ✓ Connected")

    regs = result["registers"]
    decoded = result.get("decoded_floats", [])
    input_regs = result.get("input_registers", [])
    coils = result.get("active_coils", [])

    print(f"  Found: {len(regs)} holding registers, {len(input_regs)} input registers, {len(coils)} active coils")

    if regs:
        # Group registers into contiguous blocks for readability
        print(f"\n  ┌─ Holding Registers ({len(regs)} found)")
        print(f"  │  {'ADDR':>6s}  {'RAW':>6s}  {'HEX':>6s}")
        print(f"  │  {'─'*6}  {'─'*6}  {'─'*6}")

        for r in regs:
            # Highlight non-zero values
            marker = " ◄" if r["raw_value"] != 0 else ""
            print(f"  │  {r['address']:>6d}  {r['raw_value']:>6d}  {r['hex']:>6s}{marker}")
        print(f"  └{'─' * 40}")

    if decoded:
        print(f"\n  ┌─ Decoded Float32 Values ({len(decoded)} pairs)")
        print(f"  │  {'ADDR PAIR':>12s}  {'FLOAT VALUE':>14s}  {'VARIABLE NAME'}")
        print(f"  │  {'─'*12}  {'─'*14}  {'─'*35}")
        for d in decoded:
            label = _label_for_addr_pair(d['address_pair'])
            label_str = label if label else d['encoding']
            print(f"  │  {d['address_pair']:>12s}  {d['float_value']:>14.4f}  {label_str}")
        print(f"  └{'─' * 65}")

    if input_regs:
        non_zero = [r for r in input_regs if r["raw_value"] != 0]
        print(f"\n  ┌─ Input Registers ({len(input_regs)} found, {len(non_zero)} non-zero)")
        for r in non_zero[:30]:
            print(f"  │  addr={r['address']:>6d}  val={r['raw_value']:>6d}  {r['hex']}")
        if len(non_zero) > 30:
            print(f"  │  ... and {len(non_zero) - 30} more")
        print(f"  └{'─' * 40}")

    # Decoded input register floats
    ir_decoded = result.get("input_decoded_floats", [])
    if ir_decoded:
        print(f"\n  ┌─ Input Register Float32 Decoded ({len(ir_decoded)} pairs)")
        print(f"  │  {'ADDR PAIR':>12s}  {'FLOAT VALUE':>14s}  {'VARIABLE NAME'}")
        print(f"  │  {'─'*12}  {'─'*14}  {'─'*35}")
        for d in ir_decoded:
            label = _label_for_addr_pair(d['address_pair'])
            label_str = label if label else d['encoding']
            print(f"  │  {d['address_pair']:>12s}  {d['float_value']:>14.4f}  {label_str}")
        print(f"  └{'─' * 65}")

    if coils:
        print(f"\n  ┌─ Active Coils ({len(coils)} ON)")
        for c in coils:
            print(f"  │  coil[{c['address']}] = ON")
        print(f"  └{'─' * 40}")


# ═══════════════════════════════════════════════════════════════════════════════
#  COBOT (TM ROBOT) TCP DISCOVERY
# ═══════════════════════════════════════════════════════════════════════════════

def discover_cobot(name: str, host: str, port: int) -> Dict[str, Any]:
    """
    Attempt to connect to TM Cobot via raw TCP and read any available data.
    The TM robot uses TMSCT (TM Script) protocol on the listen port.
    """
    result = {
        "machine": name,
        "protocol": "TCP / TMSCT",
        "host": host,
        "port": port,
        "connected": False,
        "received_data": [],
        "errors": [],
    }

    alive, latency = _ping(host, port)
    if not alive:
        result["errors"].append(f"Host {host}:{port} unreachable (latency test failed)")
        return result

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        result["connected"] = True
        print(f"  ✓ Connected to {host}:{port}")

        # Try to receive any initial data the robot sends on connect
        try:
            sock.settimeout(3)
            data = sock.recv(4096)
            if data:
                result["received_data"].append({
                    "type": "initial_response",
                    "raw_bytes": data.hex(),
                    "ascii": data.decode("ascii", errors="replace"),
                    "length": len(data),
                })
                print(f"  Received {len(data)} bytes on connect")
        except socket.timeout:
            print(f"  No initial data (robot may wait for commands)")

        # Try sending a TMSCT status query
        # TMSCT format: $TMSCT,<length>,<id>,<script>,*<checksum>\r\n
        for label, script in [
            ("ListenNode query", "1,ListenNode(1,1)"),
            ("ScriptExit", "1,ScriptExit()"),
        ]:
            try:
                # Build TMSCT packet
                body = f"{script}"
                length = len(body)
                raw = f"$TMSCT,{length},{body},*"
                # Compute XOR checksum
                chk = 0
                for ch in raw[1:]:  # Skip leading $
                    if ch == '*':
                        break
                    chk ^= ord(ch)
                packet = f"{raw}{chk:02X}\r\n".encode("ascii")

                sock.sendall(packet)
                time.sleep(0.5)
                sock.settimeout(2)
                resp = sock.recv(4096)
                if resp:
                    result["received_data"].append({
                        "type": label,
                        "sent": packet.decode("ascii", errors="replace").strip(),
                        "raw_bytes": resp.hex(),
                        "ascii": resp.decode("ascii", errors="replace").strip(),
                        "length": len(resp),
                    })
            except socket.timeout:
                pass
            except Exception as e:
                result["errors"].append(f"{label}: {e}")

    except Exception as e:
        result["errors"].append(f"TCP connection error: {e}")
    finally:
        try:
            sock.close()
        except Exception:
            pass

    return result


def print_cobot_result(result: Dict[str, Any]):
    """Pretty-print Cobot TCP discovery results."""
    _section(f"{result['machine']} — {result['host']}:{result['port']}")

    if not result["connected"]:
        for err in result["errors"]:
            print(f"  ✗ {err}")
        return

    print(f"  ✓ Connected")

    for item in result["received_data"]:
        print(f"\n  ┌─ {item['type']} ({item['length']} bytes)")
        if item.get("sent"):
            print(f"  │  SENT: {item['sent']}")
        print(f"  │  ASCII: {item['ascii'][:200]}")
        print(f"  │  HEX:   {item['raw_bytes'][:100]}")
        print(f"  └{'─' * 40}")

    if not result["received_data"]:
        print(f"  (No data received — robot may be in standby or require manual listen mode)")


# ═══════════════════════════════════════════════════════════════════════════════
#  MACHINE REGISTRY — built from centralized settings
# ═══════════════════════════════════════════════════════════════════════════════

MACHINES = [
    # OPC-UA machines
    {
        "id": "asrs",
        "name": "ASRS (Automated Storage & Retrieval)",
        "type": "opcua",
        "url": settings.ASRS_OPCUA_URL,
    },
    {
        "id": "mirac",
        "name": "MIRAC CNC Station",
        "type": "opcua",
        "url": settings.MIRAC_OPCUA_URL,
    },
    {
        "id": "hydraulic",
        "name": "Hydraulic / Assembly Station",
        "type": "opcua",
        "url": settings.HYDRAULIC_OPCUA_URL,
    },
    {
        "id": "triac",
        "name": "TRIAC CNC Station (S7/OPC-UA probe)",
        "type": "opcua",
        "url": settings.TRIAC_OPCUA_URL,
    },

    # Modbus TCP machines
    {
        "id": "vibit_mirac",
        "name": "VIBIT Vibration Sensor (MIRAC — Spindle, Unit 1)",
        "type": "modbus",
        "host": settings.VIBIT_HOST,
        "port": settings.VIBIT_PORT,
        "unit_id": settings.VIBIT_UNIT_ID,
    },
    {
        "id": "vibit_mirac_2",
        "name": "VIBIT Vibration Sensor (MIRAC — Tool, Unit 2)",
        "type": "modbus",
        "host": settings.VIBIT_HOST,
        "port": settings.VIBIT_PORT,
        "unit_id": settings.VIBIT_UNIT_ID_2,
    },
    {
        "id": "vibit_mirac_3",
        "name": "VIBIT Vibration Sensor (MIRAC — Feed/Axes, Unit 3)",
        "type": "modbus",
        "host": settings.VIBIT_HOST,
        "port": settings.VIBIT_PORT,
        "unit_id": settings.VIBIT_UNIT_ID_3,
    },
    {
        "id": "vibit_triac",
        "name": "VIBIT Vibration Sensor (TRIAC — Spindle, Unit 1)",
        "type": "modbus",
        "host": settings.TRIAC_VIBIT_HOST,
        "port": settings.TRIAC_VIBIT_PORT,
        "unit_id": settings.TRIAC_VIBIT_UNIT_ID,
    },
    {
        "id": "vibit_triac_2",
        "name": "VIBIT Vibration Sensor (TRIAC — Tool, Unit 2)",
        "type": "modbus",
        "host": settings.TRIAC_VIBIT_HOST,
        "port": settings.TRIAC_VIBIT_PORT,
        "unit_id": settings.TRIAC_VIBIT_UNIT_ID_2,
    },
    {
        "id": "vibit_triac_3",
        "name": "VIBIT Vibration Sensor (TRIAC — Feed/Axes, Unit 3)",
        "type": "modbus",
        "host": settings.TRIAC_VIBIT_HOST,
        "port": settings.TRIAC_VIBIT_PORT,
        "unit_id": settings.TRIAC_VIBIT_UNIT_ID_3,
    },
    {
        "id": "amr",
        "name": "AMR Autonomous Mobile Robot",
        "type": "modbus",
        "host": settings.AMR_HOST,
        "port": settings.AMR_PORT,
        "unit_id": settings.AMR_UNIT_ID,
    },

    # Raw TCP machines
    {
        "id": "cobot",
        "name": "TM Cobot (TMSCT)",
        "type": "cobot_tcp",
        "host": settings.COBOT_HOST,
        "port": settings.COBOT_PORT,
    },
]


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Discover tags, variables, and registers from all CoEDM machines.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
        Examples:
          python scripts/discover_tags.py                     All machines
          python scripts/discover_tags.py --machine mirac     Only MIRAC OPC-UA
          python scripts/discover_tags.py --machine vibit_mirac  Only MIRAC VIBIT sensor
          python scripts/discover_tags.py --opcua-only        All OPC-UA machines
          python scripts/discover_tags.py --modbus-only       All Modbus machines
          python scripts/discover_tags.py --json              Output as JSON
          python scripts/discover_tags.py --json --out tags.json  Save to file
        """),
    )
    parser.add_argument(
        "--machine", "-m",
        choices=[m["id"] for m in MACHINES],
        help="Target a single machine by ID",
    )
    parser.add_argument("--opcua-only", action="store_true", help="Only scan OPC-UA machines")
    parser.add_argument("--modbus-only", action="store_true", help="Only scan Modbus machines")
    parser.add_argument("--cobot-only", action="store_true", help="Only scan Cobot")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--out", "-o", help="Write JSON output to file")
    parser.add_argument("--depth", type=int, default=6, help="OPC-UA browse depth (default 6)")
    args = parser.parse_args()

    # Filter machines
    targets = MACHINES[:]
    if args.machine:
        targets = [m for m in targets if m["id"] == args.machine]
    elif args.opcua_only:
        targets = [m for m in targets if m["type"] == "opcua"]
    elif args.modbus_only:
        targets = [m for m in targets if m["type"] == "modbus"]
    elif args.cobot_only:
        targets = [m for m in targets if m["type"] == "cobot_tcp"]

    _banner(f"CoEDM Tag Discovery — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Targets: {len(targets)} machines")
    print(f"  Config source: backend/.env → backend/config.py")

    all_results = []
    t_start = time.perf_counter()

    for machine in targets:
        machine_type = machine["type"]
        machine_name = machine["name"]

        _banner(f"🔍 {machine_name}")

        if machine_type == "opcua":
            result = discover_opcua(machine_name, machine["url"], max_depth=args.depth)
            if not args.json:
                print_opcua_result(result)

        elif machine_type == "modbus":
            result = discover_modbus(
                machine_name,
                machine["host"],
                machine["port"],
                machine.get("unit_id", 1),
            )
            if not args.json:
                print_modbus_result(result)

        elif machine_type == "cobot_tcp":
            result = discover_cobot(machine_name, machine["host"], machine["port"])
            if not args.json:
                print_cobot_result(result)

        else:
            result = {"machine": machine_name, "error": f"Unknown type: {machine_type}"}

        result["machine_id"] = machine["id"]
        all_results.append(result)

    elapsed = round(time.perf_counter() - t_start, 1)

    # Summary
    _banner("SUMMARY")
    for r in all_results:
        status = "✓ CONNECTED" if r.get("connected") else "✗ OFFLINE"
        proto = r.get("protocol", "?")

        count = ""
        if r.get("nodes"):
            vars_count = len([n for n in r["nodes"] if "Variable" in n.get("node_class", "")])
            count = f" — {vars_count} variables"
        if r.get("registers") or r.get("input_registers"):
            hr = len(r.get('registers', []))
            ir = len(r.get('input_registers', []))
            parts = []
            if hr: parts.append(f"{hr} holding")
            if ir: parts.append(f"{ir} input")
            count = f" — {' + '.join(parts)} registers"
        elif r.get("received_data"):
            count = f" — {len(r['received_data'])} responses"

        print(f"  {status:15s}  [{proto:12s}]  {r['machine']}{count}")

    print(f"\n  Total time: {elapsed}s")

    # JSON output
    if args.json or args.out:
        output = {
            "timestamp": datetime.now().isoformat(),
            "machines": all_results,
            "scan_time_s": elapsed,
        }
        json_str = json.dumps(output, indent=2, default=str)
        if args.out:
            with open(args.out, "w") as f:
                f.write(json_str)
            print(f"\n  JSON saved to: {args.out}")
        else:
            print(f"\n{json_str}")


if __name__ == "__main__":
    main()
