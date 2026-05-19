import time
import socket
import threading
import json
from opcua import Client, ua

SERVER_URL = "opc.tcp://10.10.14.104:4840"
NETWORK_PORT = 8888

LETTERS = ["A", "B", "C", "D", "E"]
NUMBERS = range(1, 8)
PLC_NAMESPACE = 4

LED_TAGS = [f"led{l}{n}" for l in LETTERS for n in NUMBERS]


class LEDHandler:
    def __init__(self, controller):
        self.ctrl = controller

    def datachange_notification(self, node, val, data):
        tag = self.ctrl.node_to_tag.get(node.nodeid.to_string())
        if not tag:
            return

        box = tag.replace("led", "")
        self.ctrl.led_state[box] = bool(val)
        self.ctrl.render_led_grid()


class ASRSController:
    def __init__(self):
        self.client = None
        self.node_map = {}
        self.node_to_tag = {}
        self.connected = False
        self.led_state = {f"{l}{n}": False for l in LETTERS for n in NUMBERS}
        self.sub = None

    def connect(self):
        self.client = Client(SERVER_URL, timeout=10)
        self.client.connect()
        self.connected = True
        print(f"Connected to PLC at {SERVER_URL}")
        self._build_node_map()
        self._subscribe_leds()

    def disconnect(self):
        if self.sub:
            self.sub.delete()
        if self.client:
            self.client.disconnect()
        self.connected = False
        print("Disconnected from PLC")

    def _build_node_map(self):
        print("Discovering LED nodes...")
        for tag in LED_TAGS:
            nodeid = f"ns={PLC_NAMESPACE};s={tag}"
            try:
                node = self.client.get_node(nodeid)
                node.get_value()
                self.node_map[tag] = node
                self.node_to_tag[node.nodeid.to_string()] = tag
                print(f"  {tag}")
            except Exception as e:
                print(f"  {tag} unavailable: {e}")

        if not self.node_map:
            raise RuntimeError("No LED nodes found!")

    def _subscribe_leds(self):
        print("\nSubscribing to LED updates...\n")
        handler = LEDHandler(self)
        self.sub = self.client.create_subscription(100, handler)
        for node in self.node_map.values():
            self.sub.subscribe_data_change(node)

    def render_led_grid(self):
        print("\nLED STATUS GRID (■ = ON, · = OFF)\n")
        header = "    " + "  ".join(LETTERS)
        print(header)
        print("   " + "-" * (len(header)))

        for n in NUMBERS:
            row = [self.led_state[f"{l}{n}"] for l in LETTERS]
            symbols = ["■" if v else "·" for v in row]
            print(f"{n} | " + "  ".join(symbols))
        print()

    def interactive(self):
        print("Type 'exit' to quit.\n")
        while True:
            cmd = input("> ").strip().lower()
            if cmd in ("exit", "quit"):
                break


def main():
    ctrl = ASRSController()
    ctrl.connect()
    try:
        ctrl.interactive()
    finally:
        ctrl.disconnect()


if __name__ == "__main__":
    main()
