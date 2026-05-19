import socket
import logging
import os
import sys
import threading
import queue
import time

# Ensure project root is on path to import app.controllers works in direct script run
ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.stations.hydraulic_backend import run_hydraulic, disconnect_hydraulic


ROBOT_IP = "10.10.14.106"
PORT = 5890

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

def calc_checksum(data: str) -> str:
    chk = 0
    for ch in data:
        chk ^= ord(ch)
    return format(chk, "02X")

def build_tmsct(script: str, msg_id: str = "1") -> bytes:
    body = f"{msg_id},{script}"
    length = len(body)
    header = f"$TMSCT,{length},{body},*"
    checksum = calc_checksum(header[1:header.index(",*") + 1])
    packet = f"$TMSCT,{length},{body},*{checksum}\r\n"
    return packet.encode()

def send_command(sock, script, wait_for=None):
    """Send a command and optionally wait for a specific response."""
    packet = build_tmsct(script)
    logging.info(f"Sending: {packet.strip()}")
    sock.sendall(packet)

    while True:
        data = sock.recv(1024)
        if not data:
            logging.warning("Connection closed by robot")
            return None
        decoded = data.decode(errors="ignore").strip()
        logging.info(f"[ROBOT] {decoded}")

        if wait_for and wait_for in decoded:
            logging.info(f"Got expected response: '{wait_for}'")
            return decoded

        if "OK" in decoded and not wait_for:
            return decoded


def wait_for_message(sock, *expected_messages):
    """Keep listening until one of the expected messages is received."""
    while True:
        data = sock.recv(1024)
        if not data:
            logging.warning("Connection closed by robot")
            return None
        decoded = data.decode(errors="ignore").strip()
        logging.info(f"[ROBOT] {decoded}")

        for msg in expected_messages:
            if msg in decoded:
                logging.info(f"Got expected: '{msg}'")
                return msg  # Return WHICH message was received

        if "ERROR" in decoded:
            return "ERROR"

stop_event = threading.Event()
hydraulic_queue = queue.Queue()

def hydraulic_thread():
    logging.info("Hydraulic thread started")
    try:
        while not stop_event.is_set():
            try:
                command = hydraulic_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if command == "STOP":
                logging.info("Hydraulic thread stop requested")
                break
            logging.info(f"Hydraulic command: {command}")
            try:
                run_hydraulic(command)
            except Exception as e:
                logging.error(f"hydraulic error: {e}")
            hydraulic_queue.task_done()
    finally:
        disconnect_hydraulic()
        logging.info("Hydraulic thread ended")

def robot_thread():
    logging.info("Robot thread started")
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.connect((ROBOT_IP, PORT))
        logging.info("Connected to cobot")
        send_command(sock, "var_var = 1\nScriptExit()")
        while not stop_event.is_set():
            msg = wait_for_message(sock, "housing placed", "bearing placed")
            if msg == "housing placed":
                logging.info("housing placed -> close vice")
                hydraulic_queue.put("ON")
                send_command(sock, "ScriptExit()")
            elif msg == "bearing placed":
                logging.info("bearing placed -> run bearing on")
                hydraulic_queue.put("BEARING_ON")
                send_command(sock, "ScriptExit()")
            else:
                hydraulic_queue.put("SHAFT_ON")
                logging.info("robot thread exit condition")
                break
    except Exception as e:
        logging.error(f"Robot thread error: {e}")
    finally:
        try:
            sock.close()
            logging.info("Robot socket closed")
        except Exception:
            pass
        logging.info("Robot thread ended")

def main():
    t1 = threading.Thread(target=hydraulic_thread, daemon=True)
    t2 = threading.Thread(target=robot_thread, daemon=True)

    t1.start()
    t2.start()

    try:
        input("Press Enter to stop...\n")
    except KeyboardInterrupt:
        pass

    stop_event.set()
    hydraulic_queue.put("STOP")
    t1.join(timeout=5)
    t2.join(timeout=5)
    logging.info("Program exiting")

if __name__ == "__main__":
    main()