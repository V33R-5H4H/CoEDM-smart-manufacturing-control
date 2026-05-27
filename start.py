#!/usr/bin/env python3
"""
start.py — CoEDM Smart Manufacturing Control
=============================================
Starts both the FastAPI backend and Vite frontend dev server.
Streams colour-coded logs from both processes simultaneously.
PIDs are saved to .pids so stop.py can cleanly terminate them.

Usage:
    python start.py           # start backend + frontend
    python start.py --backend # backend only
    python start.py --frontend # frontend only
"""

import os
import sys
import json
import signal
import subprocess
import threading
import argparse
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT      = Path(__file__).parent.resolve()
BACKEND   = ROOT / "backend"
FRONTEND  = ROOT / "frontend"
VENV_PY   = ROOT / "backend" / "venv" / "Scripts" / "python.exe"
UVICORN   = ROOT / "backend" / "venv" / "Scripts" / "uvicorn.exe"
PID_FILE  = ROOT / ".pids"

# ── ANSI colours (Windows 10+ supports them) ──────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"

CYAN   = "\033[96m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
MAGENTA= "\033[95m"
WHITE  = "\033[97m"

def enable_ansi():
    """Enable ANSI escape codes on Windows."""
    if sys.platform == "win32":
        import ctypes
        kernel = ctypes.windll.kernel32
        kernel.SetConsoleMode(kernel.GetStdHandle(-11), 7)

def ts():
    return datetime.now().strftime("%H:%M:%S")

def log(label: str, colour: str, text: str):
    prefix = f"{DIM}{ts()}{RESET} {colour}{BOLD}[{label}]{RESET}"
    for line in text.rstrip("\n").splitlines():
        print(f"{prefix} {line}", flush=True)

def banner():
    print(f"""
{CYAN}{BOLD}+--------------------------------------------------+
|   CoEDM Smart Manufacturing Control -- START      |
+--------------------------------------------------+{RESET}
  {GREEN}Backend  {RESET}-> http://localhost:8000
  {GREEN}API docs {RESET}-> http://localhost:8000/docs
  {GREEN}Frontend {RESET}-> http://localhost:5173
  {DIM}Press Ctrl+C to stop all services{RESET}
""")


# ── Process streaming ─────────────────────────────────────────────────────────

def stream(proc: subprocess.Popen, label: str, colour: str):
    """Read lines from proc.stdout and print with label until EOF."""
    try:
        for raw in proc.stdout:
            line = raw.decode("utf-8", errors="replace").rstrip()
            if line:
                log(label, colour, line)
    except Exception:
        pass


# ── Start helpers ─────────────────────────────────────────────────────────────

def start_backend() -> subprocess.Popen:
    log("BOOT", MAGENTA, "Starting FastAPI backend …")

    cmd = [
        str(UVICORN) if UVICORN.exists() else "uvicorn",
        "backend.api.main:app",
        "--reload",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--log-level", "info",
    ]

    proc = subprocess.Popen(
        cmd,
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    log("BACKEND", GREEN, f"PID {proc.pid} — uvicorn started")
    return proc


def start_frontend() -> subprocess.Popen:
    log("BOOT", MAGENTA, "Starting Vite frontend …")

    npm = "npm.cmd" if sys.platform == "win32" else "npm"

    proc = subprocess.Popen(
        [npm, "run", "dev"],
        cwd=str(FRONTEND),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ},
    )
    log("FRONTEND", CYAN, f"PID {proc.pid} — npm run dev started")
    return proc


def wait_for_backend(url: str = "http://localhost:8000/api/health",
                     timeout: int = 30,
                     interval: float = 0.1):
    """Poll the backend health endpoint until it responds or timeout is reached."""
    deadline = time.time() + timeout
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    log("BOOT", GREEN, f"Backend ready (attempt {attempt})")
                    return True
        except Exception:
            pass
        time.sleep(interval)
    log("BOOT", YELLOW, f"Backend did not respond within {timeout}s — starting frontend anyway")
    return False


# ── PID persistence ───────────────────────────────────────────────────────────

def save_pids(**kwargs):
    """Save {name: pid} mapping to .pids file."""
    PID_FILE.write_text(json.dumps(kwargs, indent=2))

def clear_pids():
    if PID_FILE.exists():
        PID_FILE.unlink()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    enable_ansi()

    parser = argparse.ArgumentParser(description="Start CoEDM services")
    parser.add_argument("--backend",  action="store_true", help="Backend only")
    parser.add_argument("--frontend", action="store_true", help="Frontend only")
    args = parser.parse_args()

    run_backend  = args.backend  or (not args.backend and not args.frontend)
    run_frontend = args.frontend or (not args.backend and not args.frontend)

    banner()

    procs: list[subprocess.Popen] = []
    threads: list[threading.Thread] = []
    pid_map = {}

    if run_backend:
        bp = start_backend()
        procs.append(bp)
        pid_map["backend"] = bp.pid
        t = threading.Thread(target=stream, args=(bp, "BACKEND", GREEN), daemon=True)
        t.start()
        threads.append(t)

    if run_frontend:
        if run_backend:
            wait_for_backend()
        fp = start_frontend()
        procs.append(fp)
        pid_map["frontend"] = fp.pid
        t = threading.Thread(target=stream, args=(fp, "FRONTEND", CYAN), daemon=True)
        t.start()
        threads.append(t)

    save_pids(**pid_map)
    log("BOOT", MAGENTA, f"PIDs saved to .pids — run  python stop.py  to shut down")

    def shutdown(signum=None, frame=None):
        print(f"\n{YELLOW}{BOLD}[STOP]{RESET} Ctrl+C received — stopping all services …")
        for p in procs:
            try:
                p.terminate()
            except Exception:
                pass
        for p in procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        clear_pids()
        print(f"{GREEN}All services stopped.{RESET}")
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Wait for any process to exit (indicates a crash)
    while True:
        for p in list(procs):
            code = p.poll()
            if code is not None:
                name = "BACKEND" if (run_backend and p.pid == pid_map.get("backend")) else "FRONTEND"
                log(name, RED, f"Process exited with code {code}")
                procs.remove(p)
        if not procs:
            log("BOOT", RED, "All processes have stopped.")
            clear_pids()
            break
        threading.Event().wait(1)


if __name__ == "__main__":
    main()
