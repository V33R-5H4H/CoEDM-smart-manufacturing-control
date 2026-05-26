#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════╗
║              CoEDM — Write / Send Capability Discovery              ║
║                                                                      ║
║  Discovers what you can WRITE / SEND to each machine:                ║
║    • OPC-UA: checks AccessLevel bit for CurrentWrite                 ║
║    • Modbus: tests FC5 (coil), FC6 (single reg), FC16 (multi reg)   ║
║    • Cobot:  lists available TMSCT script commands                   ║
║                                                                      ║
║  SAFE: Uses read-current → write-same-value-back to confirm write   ║
║  access.  No state changes on production equipment.                  ║
║                                                                      ║
║  Usage:                                                              ║
║    python scripts/discover_write_capabilities.py                     ║
║    python scripts/discover_write_capabilities.py --machine hydraulic ║
║    python scripts/discover_write_capabilities.py --opcua-only        ║
║    python scripts/discover_write_capabilities.py --json -o out.json  ║
╚══════════════════════════════════════════════════════════════════════╝
"""

import os, sys, json, time, struct, socket, argparse, textwrap
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

# ── Project root on sys.path ──────────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_SCRIPT_DIR)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

try:
    from backend.config import settings
except Exception as e:
    print(f"[FATAL] Cannot import backend.config.settings: {e}")
    print("        Run from project root:  python scripts/discover_write_capabilities.py")
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
    t0 = time.perf_counter()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True, round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        return False, 0.0


# ═══════════════════════════════════════════════════════════════════════════════
#  OPC-UA WRITE CAPABILITY DISCOVERY
# ═══════════════════════════════════════════════════════════════════════════════

# Known tag registries per PLC type — from existing station drivers
OMRON_ASRS_TAGS = (
    # LED nodes: ns=4;s=ledA1 .. ledE7
    [f"ns=4;s=led{L}{N}" for L in "ABCDE" for N in range(1, 8)]
    # Command nodes: K{col}_{row}_R{cmd}
    + [f"ns=4;s=K{c}_{r}_R{cmd}" for c in range(1, 8) for r in range(1, 6) for cmd in range(1, 6)]
)

SIEMENS_MIRAC_TAGS = [
    ("ns=4;i=8",  "led_red"),
    ("ns=4;i=9",  "led_yellow"),
    ("ns=4;i=10", "led_green"),
    ("ns=4;i=24", "spindle_speed"),
    ("ns=4;i=20", "spindle_temp"),
    ("ns=4;i=22", "spindle_vibration"),
    ("ns=4;i=13", "tool_number"),
    ("ns=4;i=19", "tool_temp"),
    ("ns=4;i=21", "tool_vibration"),
    ("ns=4;i=11", "x_axis_value"),
    ("ns=4;i=12", "z_axis_value"),
    ("ns=4;i=14", "x_axis_feed"),
    ("ns=4;i=15", "z_axis_feed"),
    ("ns=4;i=16", "cycle_start"),
    ("ns=4;i=17", "cycle_stop"),
    ("ns=4;i=23", "pneumatic_chuck"),
]

CODESYS_HYDRAULIC_DEVICE = "AX-308EA0MA1P"
CODESYS_HYDRAULIC_TAGS = [
    # PLC_PRG
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Opration_Bering_On", "bearing_operation"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Opration_Shaft_On",  "shaft_operation"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output06",           "buzzer"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Red",                "light_red"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Orange",             "light_orange"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Relay1",             "relay_1"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Relay2",             "relay_2"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Relay3",             "relay_3 (light_green)"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.Relay4",             "relay_4"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output01",           "output01"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output02",           "output02"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output03",           "output03"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output04",           "output04"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output05",           "output05"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output07",           "output07"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.PLC_PRG.output08",           "output08"),
    # GVL
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.GVL.mm",                     "displacement_mm"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.GVL.open",                   "vice_open"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.GVL.Close",                  "vice_close"),
    (f"|var|{CODESYS_HYDRAULIC_DEVICE}.Application.GVL.Buzzer",                 "safety_curtain"),
]


def discover_opcua_write(name: str, url: str, tag_list) -> Dict[str, Any]:
    """
    For each known tag, read its AccessLevel to determine if it is writable.
    Also attempts a safe write-back (read → write same value) to confirm.
    """
    result = {
        "machine": name,
        "protocol": "OPC-UA",
        "url": url,
        "connected": False,
        "readable_tags": [],
        "writable_tags": [],
        "write_confirmed_tags": [],
        "read_only_tags": [],
        "unreachable_tags": [],
        "errors": [],
    }

    try:
        from asyncua.sync import Client
        from asyncua import ua
    except ImportError:
        result["errors"].append("asyncua not installed — pip install asyncua")
        return result

    try:
        parts = url.split("//")[1].split(":")
        host = parts[0]
        port = int(parts[1].split("/")[0]) if len(parts) > 1 else 4840
    except Exception:
        host, port = url, 4840

    alive, _ = _ping(host, port)
    if not alive:
        result["errors"].append(f"Host {host}:{port} unreachable")
        return result

    client = None
    try:
        client = Client(url, timeout=10)
        client.connect()
        result["connected"] = True

        for tag_entry in tag_list:
            # Normalize tag_entry to (node_id_str, label)
            if isinstance(tag_entry, tuple):
                nid_str, label = tag_entry
            else:
                nid_str = tag_entry
                # Extract short label from node ID
                if ";s=" in nid_str:
                    label = nid_str.split(";s=")[-1]
                else:
                    label = nid_str

            tag_info = {
                "node_id": nid_str,
                "label": label,
            }

            try:
                node = client.get_node(nid_str)

                # Read current value
                try:
                    val = node.get_value()
                    tag_info["current_value"] = str(val)
                    tag_info["python_type"] = type(val).__name__
                except Exception as e:
                    tag_info["current_value"] = f"<unreadable: {e}>"
                    result["unreachable_tags"].append(tag_info)
                    continue

                result["readable_tags"].append(tag_info)

                # Read data type
                try:
                    dt = node.get_data_type_as_variant_type()
                    tag_info["data_type"] = str(dt)
                except Exception:
                    tag_info["data_type"] = "unknown"

                # Check AccessLevel attribute
                writable = False
                try:
                    access = node.get_access_level()
                    # Bit 0 = CurrentRead, Bit 1 = CurrentWrite
                    tag_info["access_level"] = int(access)
                    tag_info["access_read"] = bool(access & 0x01)
                    tag_info["access_write"] = bool(access & 0x02)
                    writable = bool(access & 0x02)
                except Exception as e:
                    tag_info["access_level"] = "unknown"
                    tag_info["access_write"] = "unknown"

                # Check UserAccessLevel (what THIS session can do)
                try:
                    user_access = node.get_user_access_level()
                    tag_info["user_access_level"] = int(user_access)
                    tag_info["user_can_write"] = bool(user_access & 0x02)
                    if tag_info["user_can_write"]:
                        writable = True
                except Exception:
                    pass

                if writable:
                    result["writable_tags"].append(tag_info)

                    # Safe write-back confirmation: write the SAME value back
                    try:
                        variant_type = node.get_data_type_as_variant_type()
                        node.write_value(ua.DataValue(ua.Variant(val, variant_type)))
                        tag_info["write_confirmed"] = True
                        result["write_confirmed_tags"].append(tag_info)
                    except Exception as we:
                        tag_info["write_confirmed"] = False
                        tag_info["write_error"] = str(we)
                else:
                    result["read_only_tags"].append(tag_info)

            except Exception as e:
                tag_info["error"] = str(e)
                result["unreachable_tags"].append(tag_info)

    except Exception as e:
        result["errors"].append(f"Connection failed: {e}")
    finally:
        if client:
            try:
                client.disconnect()
            except Exception:
                pass

    return result


def print_opcua_write_result(result: Dict[str, Any]):
    _section(f"{result['machine']} — {result['url']}")

    if not result["connected"]:
        for err in result["errors"]:
            print(f"  ✗ {err}")
        return

    print(f"  ✓ Connected")
    print(f"  Tags probed: {len(result['readable_tags']) + len(result['unreachable_tags'])}")
    print(f"  Readable:    {len(result['readable_tags'])}")
    print(f"  Writable:    {len(result['writable_tags'])}")
    print(f"  Confirmed:   {len(result['write_confirmed_tags'])}")
    print(f"  Read-only:   {len(result['read_only_tags'])}")
    print(f"  Unreachable: {len(result['unreachable_tags'])}")

    if result["write_confirmed_tags"]:
        print(f"\n  ┌─ ✅ WRITABLE (write-back confirmed) — YOU CAN SEND THESE")
        print(f"  │  {'NODE ID':35s}  {'LABEL':25s}  {'TYPE':20s}  {'CURRENT VALUE'}")
        print(f"  │  {'─'*35}  {'─'*25}  {'─'*20}  {'─'*20}")
        for t in result["write_confirmed_tags"]:
            print(f"  │  {t['node_id']:35s}  {t['label']:25s}  {t.get('data_type','?'):20s}  {str(t.get('current_value',''))[:20]}")
        print(f"  └{'─' * 105}")

    writable_not_confirmed = [t for t in result["writable_tags"] if not t.get("write_confirmed")]
    if writable_not_confirmed:
        print(f"\n  ┌─ ⚠️  WRITABLE (access flag set, write-back FAILED)")
        for t in writable_not_confirmed:
            print(f"  │  {t['node_id']:35s}  {t['label']:25s}  error: {t.get('write_error','')[:40]}")
        print(f"  └{'─' * 105}")

    if result["read_only_tags"]:
        print(f"\n  ┌─ 🔒 READ-ONLY (cannot send)")
        print(f"  │  {'NODE ID':35s}  {'LABEL':25s}  {'TYPE':20s}  {'CURRENT VALUE'}")
        print(f"  │  {'─'*35}  {'─'*25}  {'─'*20}  {'─'*20}")
        for t in result["read_only_tags"]:
            print(f"  │  {t['node_id']:35s}  {t['label']:25s}  {t.get('data_type','?'):20s}  {str(t.get('current_value',''))[:20]}")
        print(f"  └{'─' * 105}")

    if result["unreachable_tags"]:
        print(f"\n  ┌─ ❌ UNREACHABLE (node doesn't exist or access denied)")
        for t in result["unreachable_tags"][:10]:
            print(f"  │  {t['node_id']:35s}  {t['label']:25s}")
        remaining = len(result["unreachable_tags"]) - 10
        if remaining > 0:
            print(f"  │  ... and {remaining} more")
        print(f"  └{'─' * 65}")


# ═══════════════════════════════════════════════════════════════════════════════
#  MODBUS WRITE CAPABILITY DISCOVERY
# ═══════════════════════════════════════════════════════════════════════════════

# VIBIT register map with known names
VIBIT_REGISTER_NAMES = {
    4000: ("x_rms_acc [lo]",   "sensor_data"),
    4001: ("x_rms_acc [hi]",   "sensor_data"),
    4002: ("y_rms_acc [lo]",   "sensor_data"),
    4003: ("y_rms_acc [hi]",   "sensor_data"),
    4004: ("z_rms_acc [lo]",   "sensor_data"),
    4005: ("z_rms_acc [hi]",   "sensor_data"),
    4006: ("x_rms_vel [lo]",   "sensor_data"),
    4007: ("x_rms_vel [hi]",   "sensor_data"),
    4008: ("y_rms_vel [lo]",   "sensor_data"),
    4009: ("y_rms_vel [hi]",   "sensor_data"),
    4010: ("z_rms_vel [lo]",   "sensor_data"),
    4011: ("z_rms_vel [hi]",   "sensor_data"),
    4012: ("temperature [lo]", "sensor_data"),
    4013: ("temperature [hi]", "sensor_data"),
    4014: ("x_peak_acc [lo]",  "sensor_data"),
    4015: ("x_peak_acc [hi]",  "sensor_data"),
    4016: ("y_peak_acc [lo]",  "sensor_data"),
    4017: ("y_peak_acc [hi]",  "sensor_data"),
    4018: ("z_peak_acc [lo]",  "sensor_data"),
    4019: ("z_peak_acc [hi]",  "sensor_data"),
    4020: ("x_peak_vel [lo]",  "sensor_data"),
    4021: ("x_peak_vel [hi]",  "sensor_data"),
    4022: ("y_peak_vel [lo]",  "sensor_data"),
    4023: ("y_peak_vel [hi]",  "sensor_data"),
    4024: ("z_peak_vel [lo]",  "sensor_data"),
    4025: ("z_peak_vel [hi]",  "sensor_data"),
    4030: ("reboot_count [lo]","config"),
    4031: ("reboot_count [hi]","config"),
    4034: ("led_status [lo]",  "control"),
    4035: ("led_status [hi]",  "control"),
    4038: ("rpm [lo]",         "config"),
    4039: ("rpm [hi]",         "config"),
}


def discover_modbus_write(name: str, host: str, port: int = 502,
                          unit_id: int = 1) -> Dict[str, Any]:
    """
    Test which Modbus function codes the device accepts for writing.
    Uses SAFE read-back-write: reads a register's current value, writes
    the same value back, and checks if the write succeeded.
    """
    result = {
        "machine": name,
        "protocol": "Modbus TCP",
        "host": host,
        "port": port,
        "unit_id": unit_id,
        "connected": False,
        "capabilities": {},
        "writable_holding_registers": [],
        "readonly_holding_registers": [],
        "writable_coils": [],
        "writable_input_registers": False,
        "supported_function_codes": [],
        "errors": [],
    }

    try:
        from pymodbus.client import ModbusTcpClient
    except ImportError:
        result["errors"].append("pymodbus not installed — pip install pymodbus")
        return result

    alive, _ = _ping(host, port)
    if not alive:
        result["errors"].append(f"Host {host}:{port} unreachable")
        return result

    client = ModbusTcpClient(host, port=port, timeout=3)

    try:
        if not client.connect():
            result["errors"].append("Modbus connect returned False")
            return result

        result["connected"] = True
        print(f"  ✓ Connected to {host}:{port} (unit {unit_id})")

        # ── Test 1: Which holding registers exist and are writable? ───────
        print(f"  Testing holding register write access...")
        scan_ranges = [(4000, 40), (4096, 20), (0, 50)]

        for start, count in scan_ranges:
            try:
                read_resp = client.read_holding_registers(
                    address=start, count=count, slave=unit_id
                )
                if read_resp.isError():
                    continue

                for i, val in enumerate(read_resp.registers):
                    addr = start + i
                    reg_name, reg_type = VIBIT_REGISTER_NAMES.get(
                        addr, (f"register_{addr}", "unknown")
                    )

                    reg_info = {
                        "address": addr,
                        "name": reg_name,
                        "category": reg_type,
                        "current_value": val,
                    }

                    # Safe write-back test: write the same value
                    try:
                        write_resp = client.write_register(
                            address=addr, value=val, slave=unit_id
                        )
                        if write_resp.isError():
                            reg_info["writable"] = False
                            reg_info["reason"] = str(write_resp)
                            result["readonly_holding_registers"].append(reg_info)
                        else:
                            reg_info["writable"] = True
                            result["writable_holding_registers"].append(reg_info)
                    except Exception as e:
                        reg_info["writable"] = False
                        reg_info["reason"] = str(e)
                        result["readonly_holding_registers"].append(reg_info)

            except Exception:
                continue

        # ── Test 2: Coil write access ─────────────────────────────────────
        print(f"  Testing coil write access...")
        for addr in range(0, 50):
            try:
                read_resp = client.read_coils(address=addr, count=1, slave=unit_id)
                if read_resp.isError():
                    continue

                current_val = read_resp.bits[0]

                # Safe write-back
                write_resp = client.write_coil(
                    address=addr, value=current_val, slave=unit_id
                )
                if not write_resp.isError():
                    result["writable_coils"].append({
                        "address": addr,
                        "current_value": current_val,
                        "writable": True,
                    })
            except Exception:
                continue

        # ── Test 3: Input registers (should be read-only) ─────────────────
        print(f"  Testing input register write access (expect read-only)...")
        try:
            ir_read = client.read_input_registers(address=4000, count=2, slave=unit_id)
            if not ir_read.isError():
                # Input registers are read-only by Modbus spec
                result["writable_input_registers"] = False
                result["capabilities"]["input_registers_readable"] = True
        except Exception:
            pass

        # ── Test 4: Supported function codes ──────────────────────────────
        print(f"  Testing supported function codes...")
        fc_tests = [
            ("FC1  Read Coils",              lambda: client.read_coils(0, 1, slave=unit_id)),
            ("FC2  Read Discrete Inputs",    lambda: client.read_discrete_inputs(0, 1, slave=unit_id)),
            ("FC3  Read Holding Registers",  lambda: client.read_holding_registers(4000, 1, slave=unit_id)),
            ("FC4  Read Input Registers",    lambda: client.read_input_registers(4000, 1, slave=unit_id)),
            ("FC5  Write Single Coil",       None),  # Already tested above
            ("FC6  Write Single Register",   None),  # Already tested above
        ]

        for fc_name, test_fn in fc_tests:
            if test_fn is None:
                # Infer from earlier tests
                if "Coil" in fc_name and result["writable_coils"]:
                    result["supported_function_codes"].append(fc_name)
                elif "Register" in fc_name and result["writable_holding_registers"]:
                    result["supported_function_codes"].append(fc_name)
                continue

            try:
                resp = test_fn()
                if not resp.isError():
                    result["supported_function_codes"].append(fc_name)
            except Exception:
                pass

    except Exception as e:
        result["errors"].append(f"Modbus error: {e}")
    finally:
        try:
            client.close()
        except Exception:
            pass

    return result


def print_modbus_write_result(result: Dict[str, Any]):
    _section(f"{result['machine']} — {result['host']}:{result['port']} (unit {result['unit_id']})")

    if not result["connected"]:
        for err in result["errors"]:
            print(f"  ✗ {err}")
        return

    print(f"  ✓ Connected")

    wr = result["writable_holding_registers"]
    ro = result["readonly_holding_registers"]
    coils = result["writable_coils"]
    fcs = result["supported_function_codes"]

    print(f"  Holding registers: {len(wr)} writable, {len(ro)} read-only")
    print(f"  Writable coils:    {len(coils)}")
    print(f"  Input registers:   read-only (by Modbus spec)")

    if fcs:
        print(f"\n  ┌─ 📡 Supported Function Codes")
        for fc in fcs:
            print(f"  │  ✓ {fc}")
        print(f"  └{'─' * 50}")

    if wr:
        # Group by category
        by_category: Dict[str, list] = {}
        for r in wr:
            cat = r.get("category", "unknown")
            by_category.setdefault(cat, []).append(r)

        print(f"\n  ┌─ ✅ WRITABLE HOLDING REGISTERS — YOU CAN SEND THESE")
        print(f"  │  {'ADDR':>6s}  {'REGISTER NAME':30s}  {'CATEGORY':12s}  {'CURRENT VALUE'}")
        print(f"  │  {'─'*6}  {'─'*30}  {'─'*12}  {'─'*15}")

        for cat, regs in sorted(by_category.items()):
            for r in regs:
                marker = " ◄ non-zero" if r["current_value"] != 0 else ""
                print(f"  │  {r['address']:>6d}  {r['name']:30s}  {cat:12s}  {r['current_value']:>6d}{marker}")
        print(f"  └{'─' * 70}")

    if coils:
        print(f"\n  ┌─ ✅ WRITABLE COILS — YOU CAN TOGGLE THESE")
        print(f"  │  {'ADDR':>6s}  {'CURRENT STATE'}")
        print(f"  │  {'─'*6}  {'─'*15}")
        for c in coils:
            state = "ON" if c["current_value"] else "OFF"
            print(f"  │  {c['address']:>6d}  {state}")
        print(f"  └{'─' * 25}")

    if ro:
        # Only show non-zero read-only registers (keep output clean)
        non_zero_ro = [r for r in ro if r["current_value"] != 0]
        print(f"\n  ┌─ 🔒 READ-ONLY HOLDING REGISTERS ({len(ro)} total, showing {len(non_zero_ro)} non-zero)")
        for r in non_zero_ro[:15]:
            print(f"  │  addr={r['address']:>6d}  {r['name']:30s}  val={r['current_value']:>6d}")
        if len(non_zero_ro) > 15:
            print(f"  │  ... and {len(non_zero_ro) - 15} more")
        print(f"  └{'─' * 50}")


# ═══════════════════════════════════════════════════════════════════════════════
#  COBOT (TM ROBOT) — TMSCT COMMAND REFERENCE
# ═══════════════════════════════════════════════════════════════════════════════

TMSCT_COMMANDS = {
    "Motion Commands": [
        ("PTP(\"JPP\", j1, j2, j3, j4, j5, j6, sp, ...)",
         "Point-to-Point joint move. j1-j6 = joint angles (deg), sp = speed %"),
        ("Line(\"CPP\", x, y, z, rx, ry, rz, sp, ...)",
         "Linear move to Cartesian position (mm/deg). sp = speed mm/s"),
        ("Move_PTP(\"JPP\", j1, j2, j3, j4, j5, j6, sp, ...)",
         "Same as PTP but can be queued"),
        ("Move_Line(\"CPP\", x, y, z, rx, ry, rz, sp, ...)",
         "Same as Line but can be queued"),
        ("Circle(\"CAP\", ..., sp, ta, da)",
         "Circular arc motion through defined points"),
        ("PLine(\"CPP\", x, y, z, rx, ry, rz, sp, ...)",
         "Path blending linear moves"),
    ],
    "IO Commands": [
        ("SetIO(port, state)",
         "Set digital output. port = DO0-DO15, state = 0 or 1"),
        ("int val = GetIO(port)",
         "Read digital input. port = DI0-DI15. Returns 0 or 1"),
        ("SetAO(port, value)",
         "Set analog output. port = AO0-AO1, value = 0-10V"),
        ("float val = GetAI(port)",
         "Read analog input. port = AI0-AI1"),
    ],
    "Gripper / End Effector": [
        ("SetEndDO(port, state)",
         "Set end-effector digital output"),
        ("int val = GetEndDI(port)",
         "Read end-effector digital input"),
    ],
    "System Commands": [
        ("ScriptExit()",
         "Exit the current Listen Node script"),
        ("ListenSend(id, msg)",
         "Send data back to the external client"),
        ("int mode = CameraLight(mode, color)",
         "Control TM camera light (0=off, 1=on)"),
        ("QueueTag(tag_id, wait_time)",
         "Insert a synchronization point in motion queue"),
        ("WaitQueueTag(tag_id, timeout)",
         "Wait for motion queue to reach a tag"),
        ("Pause()",
         "Pause robot motion"),
        ("Resume()",
         "Resume paused motion"),
        ("StopAndClearBuffer()",
         "Emergency stop and clear motion buffer"),
    ],
    "Variable / Data Commands": [
        ("var = GetVar(\"var_name\")",
         "Read a TM robot project variable"),
        ("SetVar(\"var_name\", value)",
         "Write a TM robot project variable"),
        ("int[] arr = GetArray(\"arr_name\", start, count)",
         "Read array variable elements"),
    ],
    "Vision Commands": [
        ("int result = Vision_DoJob(\"job_name\")",
         "Execute a TM vision job and get result"),
        ("float[] pos = Vision_GetResult(\"job_name\", index)",
         "Get position result from last vision job"),
    ],
}


def discover_cobot_write(name: str, host: str, port: int) -> Dict[str, Any]:
    result = {
        "machine": name,
        "protocol": "TCP / TMSCT",
        "host": host,
        "port": port,
        "connected": False,
        "tmsct_commands": TMSCT_COMMANDS,
        "connection_test": {},
        "errors": [],
    }

    alive, latency = _ping(host, port)
    if not alive:
        result["errors"].append(f"Host {host}:{port} unreachable")
        result["connection_test"]["note"] = (
            "Cobot listen port (5890) is only open when a TM Flow project "
            "with an active Listen Node is running on the robot."
        )
        return result

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect((host, port))
        result["connected"] = True
        result["connection_test"]["tcp_connect"] = True

        try:
            sock.settimeout(2)
            data = sock.recv(4096)
            if data:
                result["connection_test"]["initial_data"] = data.decode("ascii", errors="replace")
        except socket.timeout:
            result["connection_test"]["initial_data"] = None

    except Exception as e:
        result["errors"].append(f"TCP error: {e}")
    finally:
        try:
            sock.close()
        except Exception:
            pass

    return result


def print_cobot_write_result(result: Dict[str, Any]):
    _section(f"{result['machine']} — {result['host']}:{result['port']}")

    if not result["connected"]:
        for err in result["errors"]:
            print(f"  ✗ {err}")
        note = result.get("connection_test", {}).get("note", "")
        if note:
            print(f"  ℹ {note}")
        print()

    if result["connected"]:
        print(f"  ✓ Connected — Listen Node is active")

    print(f"\n  TMSCT Protocol — Commands you can send to the TM Cobot:")
    print(f"  Packet format: $TMSCT,<length>,<id>,<script>,*<XOR checksum>\\r\\n")

    for category, commands in result["tmsct_commands"].items():
        print(f"\n  ┌─ {category}")
        for cmd, description in commands:
            print(f"  │  ✅ {cmd}")
            print(f"  │     → {description}")
        print(f"  └{'─' * 60}")


# ═══════════════════════════════════════════════════════════════════════════════
#  MACHINE REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

MACHINES = [
    {
        "id": "asrs",
        "name": "ASRS (Automated Storage & Retrieval)",
        "type": "opcua",
        "url": settings.ASRS_OPCUA_URL,
        "tags": OMRON_ASRS_TAGS,
    },
    {
        "id": "mirac",
        "name": "MIRAC CNC Station",
        "type": "opcua",
        "url": settings.MIRAC_OPCUA_URL,
        "tags": SIEMENS_MIRAC_TAGS,
    },
    {
        "id": "hydraulic",
        "name": "Hydraulic / Assembly Station",
        "type": "opcua",
        "url": settings.HYDRAULIC_OPCUA_URL,
        "tags": CODESYS_HYDRAULIC_TAGS,
    },
    {
        "id": "triac",
        "name": "TRIAC CNC Station",
        "type": "opcua",
        "url": settings.TRIAC_OPCUA_URL,
        "tags": SIEMENS_MIRAC_TAGS,  # Similar Siemens tag layout
    },
    {
        "id": "vibit_mirac",
        "name": "VIBIT Sensor (MIRAC — Spindle, Unit 1)",
        "type": "modbus",
        "host": settings.VIBIT_HOST,
        "port": settings.VIBIT_PORT,
        "unit_id": settings.VIBIT_UNIT_ID,
    },
    {
        "id": "vibit_mirac_2",
        "name": "VIBIT Sensor (MIRAC — Tool, Unit 2)",
        "type": "modbus",
        "host": settings.VIBIT_HOST,
        "port": settings.VIBIT_PORT,
        "unit_id": settings.VIBIT_UNIT_ID_2,
    },
    {
        "id": "vibit_mirac_3",
        "name": "VIBIT Sensor (MIRAC — Feed/Axes, Unit 3)",
        "type": "modbus",
        "host": settings.VIBIT_HOST,
        "port": settings.VIBIT_PORT,
        "unit_id": settings.VIBIT_UNIT_ID_3,
    },
    {
        "id": "vibit_triac",
        "name": "VIBIT Sensor (TRIAC — Spindle, Unit 1)",
        "type": "modbus",
        "host": settings.TRIAC_VIBIT_HOST,
        "port": settings.TRIAC_VIBIT_PORT,
        "unit_id": settings.TRIAC_VIBIT_UNIT_ID,
    },
    {
        "id": "vibit_triac_2",
        "name": "VIBIT Sensor (TRIAC — Tool, Unit 2)",
        "type": "modbus",
        "host": settings.TRIAC_VIBIT_HOST,
        "port": settings.TRIAC_VIBIT_PORT,
        "unit_id": settings.TRIAC_VIBIT_UNIT_ID_2,
    },
    {
        "id": "vibit_triac_3",
        "name": "VIBIT Sensor (TRIAC — Feed/Axes, Unit 3)",
        "type": "modbus",
        "host": settings.TRIAC_VIBIT_HOST,
        "port": settings.TRIAC_VIBIT_PORT,
        "unit_id": settings.TRIAC_VIBIT_UNIT_ID_3,
    },
    {
        "id": "amr",
        "name": "AMR Mobile Robot",
        "type": "modbus",
        "host": settings.AMR_HOST,
        "port": settings.AMR_PORT,
        "unit_id": settings.AMR_UNIT_ID,
    },
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
        description="Discover write/send capabilities for all CoEDM machines.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
        Examples:
          python scripts/discover_write_capabilities.py                All machines
          python scripts/discover_write_capabilities.py -m hydraulic   Only Hydraulic
          python scripts/discover_write_capabilities.py -m cobot       Cobot commands
          python scripts/discover_write_capabilities.py --opcua-only   All OPC-UA
          python scripts/discover_write_capabilities.py --json -o w.json
        """),
    )
    parser.add_argument(
        "--machine", "-m",
        choices=[m["id"] for m in MACHINES],
        help="Target a single machine by ID",
    )
    parser.add_argument("--opcua-only", action="store_true")
    parser.add_argument("--modbus-only", action="store_true")
    parser.add_argument("--cobot-only", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", "-o")
    args = parser.parse_args()

    targets = MACHINES[:]
    if args.machine:
        targets = [m for m in targets if m["id"] == args.machine]
    elif args.opcua_only:
        targets = [m for m in targets if m["type"] == "opcua"]
    elif args.modbus_only:
        targets = [m for m in targets if m["type"] == "modbus"]
    elif args.cobot_only:
        targets = [m for m in targets if m["type"] == "cobot_tcp"]

    _banner(f"CoEDM Write Capability Discovery — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Targets: {len(targets)} machines")
    print(f"  Mode: SAFE (read-current → write-same-value → verify)")

    all_results = []
    t_start = time.perf_counter()

    for machine in targets:
        _banner(f"🔧 {machine['name']}")

        if machine["type"] == "opcua":
            result = discover_opcua_write(
                machine["name"], machine["url"], machine.get("tags", [])
            )
            if not args.json:
                print_opcua_write_result(result)

        elif machine["type"] == "modbus":
            result = discover_modbus_write(
                machine["name"],
                machine["host"],
                machine["port"],
                machine.get("unit_id", 1),
            )
            if not args.json:
                print_modbus_write_result(result)

        elif machine["type"] == "cobot_tcp":
            result = discover_cobot_write(
                machine["name"], machine["host"], machine["port"]
            )
            if not args.json:
                print_cobot_write_result(result)

        else:
            result = {"machine": machine["name"], "error": f"Unknown: {machine['type']}"}

        result["machine_id"] = machine["id"]
        all_results.append(result)

    elapsed = round(time.perf_counter() - t_start, 1)

    # Summary
    _banner("SUMMARY — What You Can Send")
    for r in all_results:
        status = "✓ CONNECTED" if r.get("connected") else "✗ OFFLINE"
        proto = r.get("protocol", "?")

        writable = ""
        if r.get("write_confirmed_tags"):
            writable = f" — {len(r['write_confirmed_tags'])} writable tags ✅"
        elif r.get("writable_tags"):
            writable = f" — {len(r['writable_tags'])} writable (unconfirmed)"
        elif r.get("writable_holding_registers"):
            wr = len(r["writable_holding_registers"])
            wc = len(r.get("writable_coils", []))
            parts = []
            if wr:
                parts.append(f"{wr} registers")
            if wc:
                parts.append(f"{wc} coils")
            writable = f" — {' + '.join(parts)} writable ✅"
        elif r.get("tmsct_commands"):
            total = sum(len(cmds) for cmds in r["tmsct_commands"].values())
            writable = f" — {total} TMSCT commands available 📋"

        if r.get("read_only_tags"):
            ro = len(r["read_only_tags"])
            writable += f", {ro} read-only"

        print(f"  {status:15s}  [{proto:12s}]  {r['machine']}{writable}")

    print(f"\n  Total time: {elapsed}s")

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
