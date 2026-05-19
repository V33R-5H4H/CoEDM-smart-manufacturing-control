#!/usr/bin/env python3
"""
stop.py -- CoEDM Smart Manufacturing Control
=============================================
Stops backend (port 8000) and frontend (port 5173) processes.

Strategy (in order):
  1. Read PIDs from .pids file (written by start.py)
  2. Fallback: scan with 'netstat -ano' for PIDs on known ports
  3. Fallback: kill by process name (uvicorn, node)

Usage:
    python stop.py              # stop backend + frontend
    python stop.py --backend    # backend only
    python stop.py --frontend   # frontend only
"""

import os
import sys
import re
import json
import subprocess
import argparse
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent.resolve()
PID_FILE = ROOT / ".pids"

# ── ANSI colours ──────────────────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
DIM    = "\033[2m"

def enable_ansi():
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.kernel32.SetConsoleMode(
            ctypes.windll.kernel32.GetStdHandle(-11), 7
        )

def log(label: str, colour: str, msg: str):
    print(f"{colour}{BOLD}[{label}]{RESET} {msg}", flush=True)


# ── Windows helpers ───────────────────────────────────────────────────────────

def pids_on_port_windows(port: int) -> list[int]:
    """Return list of PIDs listening on the given port (Windows netstat)."""
    pids = []
    try:
        out = subprocess.check_output(
            ["netstat", "-ano"],
            stderr=subprocess.DEVNULL,
            timeout=10,
        ).decode(errors="replace")
        # Match lines like:
        #   TCP    0.0.0.0:8000           0.0.0.0:0    LISTENING    31216
        pattern = re.compile(
            rf"TCP\s+\S+:{port}\s+\S+\s+LISTENING\s+(\d+)", re.IGNORECASE
        )
        for match in pattern.finditer(out):
            pids.append(int(match.group(1)))
    except Exception as e:
        log("WARN", YELLOW, f"netstat failed: {e}")
    return pids


def kill_pid_windows(pid: int, label: str) -> bool:
    """Kill a process tree by PID using taskkill /F /T."""
    try:
        result = subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(pid)],
            capture_output=True,
            timeout=10,
        )
        out = (result.stdout + result.stderr).decode(errors="replace").strip()
        if result.returncode == 0:
            log(label, GREEN, f"Killed PID {pid}  ({out})")
            return True
        else:
            # Exit code 128 = process not found
            log(label, YELLOW, f"PID {pid} not running  ({out})")
            return False
    except Exception as e:
        log(label, RED, f"taskkill error: {e}")
        return False


def kill_by_name_windows(names: list[str], label: str) -> bool:
    """Nuclear option: kill by executable name (e.g. uvicorn.exe, node.exe)."""
    killed = False
    for name in names:
        try:
            result = subprocess.run(
                ["taskkill", "/F", "/T", "/IM", name],
                capture_output=True,
                timeout=10,
            )
            out = (result.stdout + result.stderr).decode(errors="replace").strip()
            if result.returncode == 0:
                log(label, GREEN, f"Killed all '{name}' processes  ({out})")
                killed = True
            # else: process not found — that's fine
        except Exception:
            pass
    return killed


# ── Unix helpers ──────────────────────────────────────────────────────────────

def pids_on_port_unix(port: int) -> list[int]:
    pids = []
    try:
        out = subprocess.check_output(
            ["lsof", "-ti", f":{port}"],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
        pids = [int(p) for p in out.splitlines() if p.strip().isdigit()]
    except Exception:
        pass
    return pids


def kill_pid_unix(pid: int, label: str) -> bool:
    try:
        os.kill(pid, 15)  # SIGTERM
        log(label, GREEN, f"Sent SIGTERM to PID {pid}")
        return True
    except ProcessLookupError:
        log(label, YELLOW, f"PID {pid} not found")
        return False
    except Exception as e:
        log(label, RED, f"kill error: {e}")
        return False


# ── Unified kill ──────────────────────────────────────────────────────────────

def stop_service(label: str, port: int, saved_pid: int | None,
                 fallback_names: list[str]) -> bool:
    """
    Try to stop a service in order:
      1. Kill saved PID (from .pids)
      2. Kill PIDs found on the port via netstat/lsof
      3. Kill by process name (Windows only fallback)
    """
    killed = False

    # ── Step 1: kill saved PID ────────────────────────────────────────────────
    if saved_pid:
        log(label, CYAN, f"Stopping saved PID {saved_pid} ...")
        if sys.platform == "win32":
            killed |= kill_pid_windows(saved_pid, label)
        else:
            killed |= kill_pid_unix(saved_pid, label)

    # ── Step 2: kill by port ──────────────────────────────────────────────────
    log(label, CYAN, f"Scanning port {port} ...")
    if sys.platform == "win32":
        port_pids = pids_on_port_windows(port)
    else:
        port_pids = pids_on_port_unix(port)

    if port_pids:
        for pid in port_pids:
            if pid == saved_pid:
                continue  # already handled above
            log(label, CYAN, f"Found PID {pid} on port {port}")
            if sys.platform == "win32":
                killed |= kill_pid_windows(pid, label)
            else:
                killed |= kill_pid_unix(pid, label)
    else:
        log(label, DIM, f"Nothing listening on port {port}")

    # ── Step 3: name-based fallback (Windows) ─────────────────────────────────
    if not killed and sys.platform == "win32" and fallback_names:
        log(label, YELLOW, f"Trying process-name fallback: {fallback_names}")
        killed |= kill_by_name_windows(fallback_names, label)

    return killed


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    enable_ansi()

    parser = argparse.ArgumentParser(description="Stop CoEDM services")
    parser.add_argument("--backend",  action="store_true", help="Backend only")
    parser.add_argument("--frontend", action="store_true", help="Frontend only")
    args = parser.parse_args()

    stop_backend  = args.backend  or (not args.backend and not args.frontend)
    stop_frontend = args.frontend or (not args.backend and not args.frontend)

    print(f"""
{CYAN}{BOLD}+--------------------------------------------------+
|   CoEDM Smart Manufacturing Control -- STOP       |
+--------------------------------------------------+{RESET}
""")

    # Load saved PIDs
    pids = {}
    if PID_FILE.exists():
        try:
            pids = json.loads(PID_FILE.read_text())
            log("INFO", CYAN, f"Found .pids: {pids}")
        except Exception:
            log("WARN", YELLOW, ".pids unreadable — using port scan only")

    results = {}

    if stop_backend:
        results["backend"] = stop_service(
            label="BACKEND",
            port=8000,
            saved_pid=pids.get("backend"),
            fallback_names=["uvicorn.exe"],
        )

    if stop_frontend:
        results["frontend"] = stop_service(
            label="FRONTEND",
            port=5173,
            saved_pid=pids.get("frontend"),
            fallback_names=["node.exe"],
        )

    # Clean up .pids
    if PID_FILE.exists() and stop_backend and stop_frontend:
        PID_FILE.unlink()
        log("INFO", DIM, ".pids removed")

    print()
    any_killed = any(results.values())
    if any_killed:
        print(f"{GREEN}{BOLD}Done.{RESET}\n")
    else:
        print(f"{YELLOW}No running services found on expected ports.{RESET}\n")
        print(f"{DIM}Tip: run  python stop.py --force  or check Task Manager{RESET}\n")


if __name__ == "__main__":
    main()
