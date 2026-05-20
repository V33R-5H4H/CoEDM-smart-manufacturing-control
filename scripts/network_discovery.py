#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║              CoEDM — Network Discovery & Port Scanner                      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Scans the manufacturing network subnet for:                               ║
║    • Live hosts (ICMP ping sweep)                                          ║
║    • Open industrial ports (OPC-UA, Modbus, HTTP, SSH, MQTT …)             ║
║    • Protocol identification on open ports                                 ║
║    • Known vs unknown device mapping                                       ║
║                                                                            ║
║  Usage:                                                                    ║
║    python scripts/network_discovery.py                                     ║
║    python scripts/network_discovery.py --subnet 10.10.14.0/24              ║
║    python scripts/network_discovery.py --range 100-130                     ║
║    python scripts/network_discovery.py --json                              ║
║    python scripts/network_discovery.py --ports 502,4840,80                 ║
║                                                                            ║
║  NOTE: Run from the project root so that `backend` is importable.          ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import argparse
import json
import os
import platform
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Ensure project root is on sys.path
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
        f"    1. Run from the project root:  python scripts/network_discovery.py\n"
        f"    2. Have backend/.env with valid entries (see .env.example)\n"
        f"    3. Have pydantic-settings installed:  pip install pydantic-settings\n"
        f"\033[0m"
    )
    sys.exit(1)


def _cfg(name: str):
    """Read a config value from backend.config.settings (backed by .env)."""
    return getattr(settings, name)


def _parse_opcua_host(url: str) -> str:
    """Extract host from opc.tcp://host:port"""
    return url.replace("opc.tcp://", "").split(":")[0].strip("/")


# Build known-device map from config
def _build_known_devices() -> Dict[str, Dict[str, str]]:
    """Map IP → { name, protocol, role } — all IPs from backend/.env"""
    devices = {}

    devices[_parse_opcua_host(_cfg("ASRS_OPCUA_URL"))] = {
        "name": "ASRS (Automated Storage & Retrieval System)",
        "protocol": "OPC-UA",
        "role": "PLC — storage/retrieval shuttle control",
        "config_key": "ASRS_OPCUA_URL",
    }

    devices[_parse_opcua_host(_cfg("HYDRAULIC_OPCUA_URL"))] = {
        "name": "Hydraulic Assembly Station",
        "protocol": "OPC-UA",
        "role": "PLC — bearing/shaft press, vice, safety",
        "config_key": "HYDRAULIC_OPCUA_URL",
    }

    devices[_parse_opcua_host(_cfg("MIRAC_OPCUA_URL"))] = {
        "name": "MIRAC CNC Station",
        "protocol": "OPC-UA",
        "role": "CNC turning center — spindle, axes, tooling",
        "config_key": "MIRAC_OPCUA_URL",
    }

    devices[_parse_opcua_host(_cfg("TRIAC_OPCUA_URL"))] = {
        "name": "TRIAC CNC Station (Smart PC)",
        "protocol": "OPC-UA",
        "role": "CNC process control — auto-discover tags",
        "config_key": "TRIAC_OPCUA_URL",
    }

    devices[_cfg("VIBIT_HOST")] = {
        "name": "VIBIT Vibration Sensor (MIRAC)",
        "protocol": "Modbus TCP",
        "role": "Vibration & temperature monitoring on MIRAC",
        "config_key": "VIBIT_HOST",
    }

    devices[_cfg("TRIAC_VIBIT_HOST")] = {
        "name": "VIBIT Vibration Sensor (TRIAC)",
        "protocol": "Modbus TCP",
        "role": "Vibration & temperature monitoring on TRIAC",
        "config_key": "TRIAC_VIBIT_HOST",
    }

    devices[_cfg("COBOT_HOST")] = {
        "name": "TM Cobot (Collaborative Robot)",
        "protocol": "Raw TCP (TMSCT)",
        "role": "Pick-and-place for assembly station",
        "config_key": "COBOT_HOST",
    }

    devices[_cfg("AMR_HOST")] = {
        "name": "AMR (Autonomous Mobile Robot)",
        "protocol": "Modbus TCP",
        "role": "Material transport between stations",
        "config_key": "AMR_HOST",
    }

    return devices


KNOWN_DEVICES = _build_known_devices()


# ═══════════════════════════════════════════════════════════════════════════════
# Industrial port definitions
# ═══════════════════════════════════════════════════════════════════════════════

INDUSTRIAL_PORTS = {
    20:    "FTP (data)",
    21:    "FTP (control)",
    22:    "SSH",
    23:    "Telnet",
    25:    "SMTP",
    53:    "DNS",
    80:    "HTTP",
    102:   "S7comm (Siemens)",
    161:   "SNMP",
    443:   "HTTPS",
    502:   "Modbus TCP",
    830:   "NETCONF",
    993:   "IMAPS",
    1433:  "MSSQL",
    1883:  "MQTT",
    2222:  "EtherNet/IP (explicit)",
    3000:  "Grafana / Node.js",
    3306:  "MySQL",
    4000:  "ICE / Thin Client",
    4840:  "OPC-UA",
    4843:  "OPC-UA (TLS)",
    5000:  "Flask / UPnP",
    5432:  "PostgreSQL",
    5672:  "AMQP (RabbitMQ)",
    5890:  "TM Robot (TMSCT)",
    6379:  "Redis",
    8000:  "HTTP API (FastAPI/Uvicorn)",
    8080:  "HTTP Proxy / Alt-HTTP",
    8443:  "HTTPS Alt",
    8883:  "MQTT (TLS)",
    9100:  "Printer / JetDirect",
    9200:  "Elasticsearch",
    11112: "DICOM",
    27017: "MongoDB",
    44818: "EtherNet/IP (implicit)",
    48898: "CODESYS",
    62541: "OPC-UA (alternate)",
}

# Quick-scan subset for the default fast scan
QUICK_PORTS = [22, 80, 102, 443, 502, 1883, 4840, 4843, 5432, 5890, 8000, 8080, 8883, 44818, 48898, 62541]


# ═══════════════════════════════════════════════════════════════════════════════
# ANSI color helpers
# ═══════════════════════════════════════════════════════════════════════════════

_CYAN    = "\033[96m"
_GREEN   = "\033[92m"
_RED     = "\033[91m"
_YELLOW  = "\033[93m"
_MAGENTA = "\033[95m"
_WHITE   = "\033[97m"
_BOLD    = "\033[1m"
_DIM     = "\033[2m"
_RESET   = "\033[0m"

_BAR = "═" * 80


def _ok(text: str) -> str:
    return f"{_GREEN}{text}{_RESET}"

def _fail(text: str) -> str:
    return f"{_RED}{text}{_RESET}"

def _warn(text: str) -> str:
    return f"{_YELLOW}{text}{_RESET}"

def _info(text: str) -> str:
    return f"{_CYAN}{text}{_RESET}"

def _dim(text: str) -> str:
    return f"{_DIM}{text}{_RESET}"

def _bold(text: str) -> str:
    return f"{_BOLD}{text}{_RESET}"


# ═══════════════════════════════════════════════════════════════════════════════
# Network probing functions
# ═══════════════════════════════════════════════════════════════════════════════

def ping_host(ip: str, timeout: float = 1.0) -> Dict[str, Any]:
    """
    Ping a single host using the OS ping command.
    Returns { ip, alive, latency_ms, method }.
    """
    result = {"ip": ip, "alive": False, "latency_ms": None, "method": "icmp"}

    is_windows = platform.system().lower() == "windows"
    cmd = ["ping", "-n", "1", "-w", str(int(timeout * 1000)), ip] if is_windows \
        else ["ping", "-c", "1", "-W", str(int(timeout)), ip]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout + 2,
        )
        if proc.returncode == 0:
            result["alive"] = True
            # Parse latency from ping output
            output = proc.stdout.decode(errors="ignore")
            result["latency_ms"] = _extract_ping_latency(output, is_windows)
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass

    # Fallback: TCP connect to a common port if ICMP blocked
    if not result["alive"]:
        for fallback_port in [4840, 502, 80, 22]:
            try:
                t0 = time.time()
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(timeout)
                sock.connect((ip, fallback_port))
                elapsed = (time.time() - t0) * 1000
                sock.close()
                result["alive"] = True
                result["latency_ms"] = round(elapsed, 1)
                result["method"] = f"tcp/{fallback_port}"
                break
            except (socket.timeout, ConnectionRefusedError, OSError):
                continue

    return result


def _extract_ping_latency(output: str, is_windows: bool) -> Optional[float]:
    """Parse average/round-trip time from ping output."""
    import re
    if is_windows:
        # "Average = 1ms" or "time=1ms" or "time<1ms"
        m = re.search(r"time[<=](\d+)ms", output, re.IGNORECASE)
        if m:
            return float(m.group(1))
        m = re.search(r"Average\s*=\s*(\d+)ms", output, re.IGNORECASE)
        if m:
            return float(m.group(1))
    else:
        # "time=1.23 ms"
        m = re.search(r"time[=<](\d+\.?\d*)\s*ms", output)
        if m:
            return float(m.group(1))
    return None


def scan_port(ip: str, port: int, timeout: float = 1.0) -> Dict[str, Any]:
    """
    Check if a single TCP port is open on the given IP.
    Returns { port, open, service, latency_ms, banner }.
    """
    result = {
        "port": port,
        "open": False,
        "service": INDUSTRIAL_PORTS.get(port, "unknown"),
        "latency_ms": None,
        "banner": None,
    }

    try:
        t0 = time.time()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        elapsed = (time.time() - t0) * 1000
        result["open"] = True
        result["latency_ms"] = round(elapsed, 1)

        # Try to grab a banner (non-blocking, short timeout)
        try:
            sock.settimeout(0.5)
            banner = sock.recv(256)
            if banner:
                # Try decode, fall back to hex
                try:
                    result["banner"] = banner[:120].decode("utf-8", errors="replace").strip()
                except Exception:
                    result["banner"] = banner[:60].hex()
        except (socket.timeout, OSError):
            pass

        sock.close()
    except (socket.timeout, ConnectionRefusedError, OSError):
        pass

    return result


def scan_host_ports(
    ip: str,
    ports: List[int],
    timeout: float = 1.0,
    max_workers: int = 20,
) -> List[Dict[str, Any]]:
    """Scan multiple ports on a single host concurrently."""
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(scan_port, ip, p, timeout): p for p in ports}
        for future in as_completed(futures):
            results.append(future.result())
    results.sort(key=lambda r: r["port"])
    return results


def identify_protocol(ip: str, port: int, timeout: float = 2.0) -> Optional[str]:
    """
    Try to identify the specific protocol running on an open port
    by sending known handshake bytes and inspecting the response.
    """
    # OPC-UA: send HEL message
    if port in (4840, 4843, 62541):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect((ip, port))
            # OPC-UA HEL message (simplified)
            hel = b"HEL" + b"\x00" * 20
            sock.sendall(hel)
            resp = sock.recv(128)
            sock.close()
            if resp and (b"ACK" in resp or b"OPC" in resp.upper() or len(resp) > 4):
                return "OPC-UA (confirmed)"
            return "OPC-UA (port open, no ACK)"
        except Exception:
            return "OPC-UA (port open, probe failed)"

    # Modbus TCP: send a read device ID request (FC 0x2B/0x0E)
    if port == 502:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect((ip, port))
            # Modbus TCP: Transaction ID(2) + Protocol(2) + Length(2) + Unit(1) + FC(1) + MEI(1) + ReadDevId(1) + ObjId(1)
            req = bytes([
                0x00, 0x01,  # Transaction ID
                0x00, 0x00,  # Protocol ID (Modbus)
                0x00, 0x05,  # Length
                0x01,        # Unit ID
                0x2B,        # Function code: Encapsulated Interface Transport
                0x0E,        # MEI type: Read Device Identification
                0x01,        # Read Device ID code: basic
                0x00,        # Object ID: VendorName
            ])
            sock.sendall(req)
            resp = sock.recv(256)
            sock.close()
            if resp and len(resp) >= 9:
                fc = resp[7] if len(resp) > 7 else 0
                if fc == 0x2B:
                    # Parse vendor name if present
                    try:
                        if len(resp) > 15:
                            obj_count = resp[13]
                            if obj_count > 0 and len(resp) > 16:
                                str_len = resp[15]
                                vendor = resp[16:16+str_len].decode("utf-8", errors="replace")
                                return f"Modbus TCP (vendor: {vendor})"
                    except Exception:
                        pass
                    return "Modbus TCP (confirmed)"
                elif fc == 0x01 or fc == 0x03:
                    return "Modbus TCP (confirmed, basic FC)"
                elif fc & 0x80:
                    return "Modbus TCP (confirmed, exception response)"
                return "Modbus TCP (response received)"
            return "Modbus TCP (port open, no response)"
        except Exception:
            return "Modbus TCP (port open, probe failed)"

    # MQTT: send CONNECT packet
    if port in (1883, 8883):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect((ip, port))
            # Minimal MQTT CONNECT
            connect = bytes([
                0x10, 0x10,              # CONNECT, remaining length 16
                0x00, 0x04,              # Protocol name length
                0x4D, 0x51, 0x54, 0x54,  # "MQTT"
                0x04,                    # Protocol level 4
                0x02,                    # Connect flags (clean session)
                0x00, 0x3C,              # Keep alive 60s
                0x00, 0x04,              # Client ID length
                0x74, 0x65, 0x73, 0x74,  # "test"
            ])
            sock.sendall(connect)
            resp = sock.recv(64)
            sock.close()
            if resp and resp[0] == 0x20:  # CONNACK
                return "MQTT (confirmed)"
            return "MQTT (port open)"
        except Exception:
            return "MQTT (port open, probe failed)"

    # HTTP
    if port in (80, 443, 3000, 8000, 8080, 8443):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect((ip, port))
            sock.sendall(b"GET / HTTP/1.0\r\nHost: " + ip.encode() + b"\r\n\r\n")
            resp = sock.recv(512)
            sock.close()
            if resp:
                header = resp[:256].decode("utf-8", errors="replace")
                if "HTTP/" in header:
                    # Extract server header
                    for line in header.split("\r\n"):
                        if line.lower().startswith("server:"):
                            return f"HTTP ({line.split(':', 1)[1].strip()})"
                    return "HTTP (confirmed)"
            return "HTTP (port open)"
        except Exception:
            return "HTTP (port open, probe failed)"

    # S7comm (Siemens)
    if port == 102:
        return "S7comm/ISO-TSAP (Siemens PLC)"

    # EtherNet/IP
    if port in (2222, 44818):
        return "EtherNet/IP (CIP)"

    # CODESYS
    if port == 48898:
        return "CODESYS Runtime"

    return None


# ═══════════════════════════════════════════════════════════════════════════════
# Main scan orchestrator
# ═══════════════════════════════════════════════════════════════════════════════

def network_scan(
    subnet_base: str = "10.10.14",
    host_range: Tuple[int, int] = (1, 254),
    ports: Optional[List[int]] = None,
    timeout: float = 1.0,
    ping_workers: int = 40,
    port_workers: int = 20,
    identify: bool = True,
    json_output: bool = False,
) -> Dict[str, Any]:
    """
    Full network discovery:
      1. Ping sweep to find live hosts
      2. Port scan on live hosts
      3. Protocol identification on open ports
      4. Cross-reference with known device registry
    """

    timestamp = datetime.now().isoformat()
    scan_ports = ports or QUICK_PORTS
    start_ip, end_ip = host_range

    report: Dict[str, Any] = {
        "timestamp": timestamp,
        "subnet": f"{subnet_base}.0/24",
        "range_scanned": f"{subnet_base}.{start_ip} - {subnet_base}.{end_ip}",
        "ports_scanned": scan_ports,
        "live_hosts": [],
        "dead_hosts": [],
        "devices": [],
        "unknown_devices": [],
        "summary": {},
    }

    all_ips = [f"{subnet_base}.{i}" for i in range(start_ip, end_ip + 1)]

    # ── Phase 1: Ping sweep ───────────────────────────────────────────────
    if not json_output:
        print(f"\n{_BOLD}{_BAR}{_RESET}")
        print(f"{_BOLD}  CoEDM — Network Discovery & Port Scanner{_RESET}")
        print(f"{_BOLD}  {timestamp}{_RESET}")
        print(f"{_BOLD}{_BAR}{_RESET}")
        print(f"\n  {_info('Phase 1:')} Ping sweep on {_bold(f'{subnet_base}.{start_ip}-{end_ip}')} ({len(all_ips)} hosts)")
        print(f"  {_dim('Timeout: ' + str(timeout) + 's per host, ' + str(ping_workers) + ' parallel threads')}")

    live_hosts = []
    dead_count = 0
    scan_start = time.time()

    with ThreadPoolExecutor(max_workers=ping_workers) as pool:
        futures = {pool.submit(ping_host, ip, timeout): ip for ip in all_ips}
        done = 0
        for future in as_completed(futures):
            done += 1
            result = future.result()
            if result["alive"]:
                live_hosts.append(result)
                if not json_output:
                    known = KNOWN_DEVICES.get(result["ip"])
                    label = f"  {_ok('■')}" if known else f"  {_warn('■')}"
                    name = known["name"] if known else "unknown"
                    lat = f"{result['latency_ms']}ms" if result['latency_ms'] else "?"
                    print(f"    {label} {result['ip']:<18} {lat:<10} via {result['method']:<10} {_dim(name)}")
            else:
                dead_count += 1

            # Progress indicator every 25 hosts (only in pretty mode)
            if not json_output and done % 50 == 0:
                print(f"    {_dim(f'... {done}/{len(all_ips)} probed ...')}")

    ping_elapsed = time.time() - scan_start
    live_hosts.sort(key=lambda h: socket.inet_aton(h["ip"]))
    report["live_hosts"] = [h["ip"] for h in live_hosts]

    if not json_output:
        print(f"\n  {_ok(f'✓ {len(live_hosts)} live hosts')} found, {_dim(f'{dead_count} unreachable')} ({ping_elapsed:.1f}s)")

    # ── Phase 2: Port scan on live hosts ──────────────────────────────────
    if not json_output:
        print(f"\n  {_info('Phase 2:')} Port scan — {len(scan_ports)} ports × {len(live_hosts)} hosts")
        print(f"  {_dim('Ports: ' + ', '.join(str(p) for p in sorted(scan_ports)))}")

    port_start = time.time()
    devices = []

    for host_info in live_hosts:
        ip = host_info["ip"]
        known = KNOWN_DEVICES.get(ip)

        port_results = scan_host_ports(ip, scan_ports, timeout, port_workers)
        open_ports = [r for r in port_results if r["open"]]

        device_entry: Dict[str, Any] = {
            "ip": ip,
            "ping": host_info,
            "known_device": known,
            "is_known": known is not None,
            "open_ports": [],
            "services": [],
        }

        if open_ports:
            for pr in open_ports:
                port_entry = {
                    "port": pr["port"],
                    "service": pr["service"],
                    "latency_ms": pr["latency_ms"],
                    "banner": pr["banner"],
                    "protocol_id": None,
                }

                # Phase 3 inline: identify protocol
                if identify:
                    proto = identify_protocol(ip, pr["port"], timeout)
                    port_entry["protocol_id"] = proto

                device_entry["open_ports"].append(port_entry)
                device_entry["services"].append(pr["service"])

            if not json_output:
                tag = _ok("●") if known else _warn("?")
                name = known["name"] if known else "UNKNOWN DEVICE"
                print(f"\n    {tag} {_bold(ip):<20} {name}")
                for pe in device_entry["open_ports"]:
                    proto_str = f"  → {_info(pe['protocol_id'])}" if pe.get("protocol_id") else ""
                    banner_str = f"  {_dim('[' + pe['banner'][:60] + ']')}" if pe.get("banner") else ""
                    print(
                        f"      port {_bold(str(pe['port'])+'/' + 'tcp'):<14} "
                        f"{pe['service']:<28} "
                        f"{pe['latency_ms']}ms"
                        f"{proto_str}{banner_str}"
                    )
        else:
            if not json_output:
                tag = _ok("●") if known else _warn("?")
                name = known["name"] if known else "UNKNOWN"
                print(f"\n    {tag} {ip:<20} {name}  {_dim('(no open ports in scanned set)')}")

        devices.append(device_entry)

        if not known:
            report["unknown_devices"].append(device_entry)

    port_elapsed = time.time() - port_start
    report["devices"] = devices

    # ── Summary ───────────────────────────────────────────────────────────
    known_found = [d for d in devices if d["is_known"]]
    unknown_found = [d for d in devices if not d["is_known"]]
    known_missing = [
        {"ip": ip, **info}
        for ip, info in KNOWN_DEVICES.items()
        if ip not in report["live_hosts"]
    ]

    report["summary"] = {
        "total_scanned": len(all_ips),
        "live_hosts": len(live_hosts),
        "known_devices_online": len(known_found),
        "known_devices_offline": len(known_missing),
        "unknown_devices": len(unknown_found),
        "total_open_ports": sum(len(d["open_ports"]) for d in devices),
        "ping_time_s": round(ping_elapsed, 1),
        "port_scan_time_s": round(port_elapsed, 1),
        "total_time_s": round(ping_elapsed + port_elapsed, 1),
    }

    if not json_output:
        print(f"\n{_BOLD}{_BAR}{_RESET}")
        print(f"{_BOLD}  Summary{_RESET}")
        print(f"{_BOLD}{_BAR}{_RESET}")

        print(f"\n  {_bold('Network')}")
        print(f"    Subnet scanned:     {report['range_scanned']}")
        print(f"    Hosts probed:       {report['summary']['total_scanned']}")
        print(f"    Live hosts:         {_ok(str(report['summary']['live_hosts']))}")
        print(f"    Total open ports:   {report['summary']['total_open_ports']}")

        print(f"\n  {_bold('Known CoEDM Devices')}")
        print(f"    Online:             {_ok(str(report['summary']['known_devices_online']))}/{len(KNOWN_DEVICES)}")
        if known_missing:
            print(f"    {_fail('Offline / Unreachable:')}")
            for dev in known_missing:
                print(f"      {_fail('✖')} {dev['ip']:<18} {dev['name']}")
        else:
            print(f"    All configured devices are {_ok('ONLINE')}")

        if unknown_found:
            print(f"\n  {_bold('Unknown Devices')}")
            print(f"    Found:              {_warn(str(report['summary']['unknown_devices']))}")
            for dev in unknown_found:
                services = ", ".join(dev["services"]) if dev["services"] else "no open ports"
                print(f"      {_warn('?')} {dev['ip']:<18} {services}")

        print(f"\n  {_bold('Timing')}")
        print(f"    Ping sweep:         {report['summary']['ping_time_s']}s")
        print(f"    Port scan:          {report['summary']['port_scan_time_s']}s")
        print(f"    Total:              {report['summary']['total_time_s']}s")

        # Device map table
        print(f"\n  {_bold('Device Map')}")
        print(f"    {'IP':<18} {'Status':<10} {'Name':<40} {'Open Ports'}")
        print(f"    {'─'*18} {'─'*10} {'─'*40} {'─'*20}")

        # Show known devices first (sorted by IP)
        all_known_ips = sorted(KNOWN_DEVICES.keys(), key=lambda x: socket.inet_aton(x))
        for ip in all_known_ips:
            info = KNOWN_DEVICES[ip]
            is_online = ip in report["live_hosts"]
            status = _ok("ONLINE") if is_online else _fail("OFFLINE")

            open_ports_str = ""
            for d in devices:
                if d["ip"] == ip and d["open_ports"]:
                    open_ports_str = ", ".join(str(p["port"]) for p in d["open_ports"])
                    break

            print(f"    {ip:<18} {status:<19} {info['name']:<40} {open_ports_str or _dim('—')}")

        # Show unknown devices
        for dev in unknown_found:
            open_ports_str = ", ".join(str(p["port"]) for p in dev["open_ports"]) if dev["open_ports"] else "—"
            print(f"    {dev['ip']:<18} {_warn('UNKNOWN'):<19} {_warn('Not in config'):<40} {open_ports_str}")

        print(f"\n  {_dim(f'Report generated at {timestamp}')}")
        print(f"{_BOLD}{_BAR}{_RESET}\n")

    else:
        print(json.dumps(report, indent=2, default=str))

    return report


# ═══════════════════════════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="CoEDM Network Discovery — scan the manufacturing subnet",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/network_discovery.py                           Quick scan (default subnet)
  python scripts/network_discovery.py --subnet 10.10.14.0/24    Specify subnet
  python scripts/network_discovery.py --range 100-130           Scan .100 to .130 only
  python scripts/network_discovery.py --full                    Scan ALL standard industrial ports
  python scripts/network_discovery.py --ports 502,4840,80       Custom port list
  python scripts/network_discovery.py --json                    Machine-readable JSON output
  python scripts/network_discovery.py --json > scan.json        Save to file
  python scripts/network_discovery.py --timeout 2               Slower network timeout
  python scripts/network_discovery.py --no-identify             Skip protocol identification
        """,
    )
    parser.add_argument(
        "--subnet",
        type=str,
        default="10.10.14.0/24",
        help="Subnet to scan in CIDR notation (default: 10.10.14.0/24)",
    )
    parser.add_argument(
        "--range",
        type=str,
        default=None,
        dest="host_range",
        help="Host range within the subnet, e.g. '100-130' (default: 1-254)",
    )
    parser.add_argument(
        "--ports",
        type=str,
        default=None,
        help="Comma-separated list of ports to scan (default: industrial quick-scan set)",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Scan ALL known industrial ports instead of the quick-scan set",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=1.0,
        help="Per-probe timeout in seconds (default: 1.0)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=40,
        help="Max parallel ping threads (default: 40)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output machine-readable JSON",
    )
    parser.add_argument(
        "--no-identify",
        action="store_true",
        help="Skip protocol identification probes (faster)",
    )

    args = parser.parse_args()

    # Parse subnet
    subnet_base = args.subnet.split("/")[0].rsplit(".", 1)[0]  # "10.10.14"

    # Parse host range
    if args.host_range:
        parts = args.host_range.split("-")
        start = int(parts[0])
        end = int(parts[1]) if len(parts) > 1 else start
    else:
        start, end = 1, 254

    # Parse ports
    if args.ports:
        scan_ports = [int(p.strip()) for p in args.ports.split(",")]
    elif args.full:
        scan_ports = sorted(INDUSTRIAL_PORTS.keys())
    else:
        scan_ports = QUICK_PORTS

    network_scan(
        subnet_base=subnet_base,
        host_range=(start, end),
        ports=scan_ports,
        timeout=args.timeout,
        ping_workers=args.workers,
        identify=not args.no_identify,
        json_output=args.json,
    )


if __name__ == "__main__":
    main()
