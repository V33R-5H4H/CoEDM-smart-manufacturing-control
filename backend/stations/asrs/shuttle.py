import threading

class ShuttleState:
    def __init__(self):
        self.row = 7
        self.col = "A"
        self.state = "idle"  # idle | moving | busy | error
        self.active_command = None
        self.lock = threading.Lock()

    def snapshot(self):
        with self.lock:
            return {
                "row": self.row,
                "column": self.col,
                "state": self.state,
                "command": self.active_command,
            }

    def set_moving(self, col, row, command):
        with self.lock:
            self.col = col
            self.row = row
            self.active_command = command
            self.state = "moving"

    def set_idle(self):
        with self.lock:
            self.state = "idle"
            self.active_command = None

    def set_error(self):
        with self.lock:
            self.state = "error"
