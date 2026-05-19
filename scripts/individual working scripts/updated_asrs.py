import time
import socket
import threading
import json
from opcua import Client
from opcua import ua
SERVER_URL = "opc.tcp://10.10.14.104:4840"
NETWORK_PORT = 8888

LETTERS = ["A", "B", "C", "D", "E"]
NUMBERS = range(1, 8)

def build_contract():
    cmds = []
    for l in LETTERS:
        for n in NUMBERS:
            cmds.append(f"{l}{n}")
            cmds.append(f"{l}{n}S")
    cmds.append("Home")

    # Add LED and proximity commands
    for l in LETTERS:
        for n in NUMBERS:
            cmds.append(f"led{l}{n}")
    cmds.append("proximity")

    return cmds

PLC_COMMANDS = build_contract()
PLC_NAMESPACE = 4


class ASRSController:
    def __init__(self):
        self.client = None
        self.node_map = {}
        self.connected = False

    def connect(self):
        self.client = Client(SERVER_URL, timeout=10)
        self.client.connect()
        self.connected = True
        print(f"Connected to PLC at {SERVER_URL}")
        self._build_node_map()

    def disconnect(self):
        if self.client:
            self.client.disconnect()
            self.connected = False
            print("Disconnected from PLC")

    def _build_node_map(self):
        print("Discovering PLC contract nodes...")
        for tag in PLC_COMMANDS:
            nodeid = f"ns={PLC_NAMESPACE};s={tag}"
            try:
                node = self.client.get_node(nodeid)
                node.get_value()  # Validate existence
                self.node_map[tag] = node
                print(f"  {tag}")
            except Exception as e:
                print(f"  {tag} unavailable: {e}")

        if not self.node_map:
            raise RuntimeError("No PLC command nodes found!")

    from opcua import ua

    def pulse(self, tag, duration=0.1):
        if tag not in self.node_map:
            raise ValueError(f"Command {tag} not in PLC contract")

        node = self.node_map[tag]
        nodeid = node.nodeid

        def write_bool(val):
            dv = ua.DataValue()
            dv.Value = ua.Variant(val, ua.VariantType.Boolean)

            wv = ua.WriteValue()
            wv.NodeId = nodeid
            wv.AttributeId = ua.AttributeIds.Value
            wv.Value = dv

            params = ua.WriteParameters()
            params.NodesToWrite = [wv]

            self.client.uaclient.write(params)

        write_bool(True)
        time.sleep(duration)
        write_bool(False)


    def process_command(self, raw_cmd):
        cmd = raw_cmd.strip().upper()

        if cmd not in PLC_COMMANDS:
            return {"success": False, "error": f"Invalid command: {cmd}"}

        action = "Store" if cmd.endswith("S") else "Retrieve"
        location = cmd[:-1] if cmd.endswith("S") else cmd

        try:
            self.pulse(cmd)
            print(f"{action} at {location}")
            return {
                "success": True,
                "action": action,
                "location": location,
                "command": cmd
            }
        except Exception as e:
            print(f"Failed {cmd}: {e}")
            return {"success": False, "command": cmd, "error": str(e)}

    def read_node(self, tag):
        if tag not in self.node_map:
            raise ValueError(f"Command {tag} not in PLC contract")

        node = self.node_map[tag]
        try:
            value = node.get_value()
            print(f"Read value from {tag}: {value}")
            return value
        except Exception as e:
            print(f"Failed to read {tag}: {e}")
            raise

    def handle_client(self, sock, addr):
        try:
            data = sock.recv(1024).decode().strip()
            print(f"{addr} -> {data}")
            try:
                req = json.loads(data)
                cmd = req.get("command", data)
            except json.JSONDecodeError:
                cmd = data

            result = self.process_command(cmd)
            sock.send(json.dumps(result).encode())

        except Exception as e:
            sock.send(json.dumps({"success": False, "error": str(e)}).encode())
        finally:
            sock.close()

    def start_server(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(("localhost", NETWORK_PORT))
        s.listen(5)
        print(f"Listening on port {NETWORK_PORT}")

        while True:
            client, addr = s.accept()
            threading.Thread(
                target=self.handle_client,
                args=(client, addr),
                daemon=True
            ).start()

    def interactive(self):
        print("\nCommands: A1–E7 (Retrieve), A1S–E7S (Store), Home")
        print("Type 'exit' to quit.")

        while True:
            cmd = input("> Enter command (e.g., A1, ledA1, proximity): ").strip()
            if cmd.lower() in ("exit", "quit"):
                self.disconnect()
                break

            action = input("Do you want to 'read' or 'write'? ").strip().lower()

            if action == "read":
                try:
                    self.read_node(cmd)
                except Exception as e:
                    print(f"Error: {e}")
            elif action == "write":
                try:
                    self.process_command(cmd)
                except Exception as e:
                    print(f"Error: {e}")
            else:
                print("Invalid action. Please enter 'read' or 'write'.")


def main():
    ctrl = ASRSController()
    ctrl.connect()

    try:
        threading.Thread(target=ctrl.start_server, daemon=True).start()
        ctrl.interactive()
    finally:
        ctrl.disconnect()


if __name__ == "__main__":
    main()
