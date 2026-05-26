import threading
import logging
from backend.database.db import SessionLocal
from sqlalchemy import text

class ShuttleState:
    """
    Manages shuttle position and state with database persistence.
    
    Thread-safe implementation using per-operation database sessions.
    Tracks shuttle location, operational state, and active commands.
    """
    
    def __init__(self):
        """Initialize shuttle state and load from database"""
        self.row_num = 7  # Default home position row
        self.column_letter = "A"  # Default home position column
        self.state = "idle"  # idle | moving | busy | error
        self.active_command = None
        self.lock = threading.Lock()
        self._callbacks = set()
        self.load_from_db()

    def register_callback(self, callback):
        """Register a callback for state changes: callback(row, col, state, command)"""
        with self.lock:
            self._callbacks.add(callback)

    
    def _session(self):
        """Create a new database session for each operation"""
        return SessionLocal()

    def load_from_db(self):
        """Load shuttle state from database (called on initialization)"""
        with self.lock:
            session = self._session()
            try:
                result = session.execute(
                    text("""
                        SELECT to_row, to_col, current_state, last_command 
                        FROM v_shuttle_state 
                        WHERE machine_id = 'asrs'
                    """)
                ).fetchone()
                
                if result:
                    to_row, to_col, state, last_command = result
                    self.row_num = to_row if to_row is not None else 7
                    self.column_letter = to_col if to_col is not None else "A"
                    self.state = state if state is not None else "idle"
                    self.active_command = last_command
                    logging.info(f"[Shuttle] Loaded state from DB: {self.column_letter}{self.row_num}, state={self.state}")
                else:
                    logging.warning("[Shuttle] No state found in DB, using defaults")
            except Exception as e:
                logging.error(f"[Shuttle] Error loading state from DB: {e}")
            finally:
                session.close()

    def save_to_db(self):
        """Persist current shuttle state to database by inserting a movement record"""
        with self.lock:
            logging.info(f"[Shuttle] Saving state to DB: {self.column_letter}{self.row_num}, state={self.state}, command={self.active_command}")
            session = self._session()
            try:
                session.execute(
                    text("""
                        INSERT INTO shuttle_movements (machine_id, command, state, to_row, to_col, initiated_by)
                        VALUES ('asrs', :cmd, :state, :row, :col, 'operator')
                    """),
                    {
                        "row": self.row_num,
                        "col": self.column_letter,
                        "state": self.state,
                        "cmd": self.active_command,
                    }
                )
                session.commit()
                logging.info("[Shuttle] State saved to DB successfully (new movement recorded)")
            except Exception as e:
                logging.error(f"[Shuttle] Error saving state to DB: {e}")
                session.rollback()
                raise
            finally:
                session.close()

    def snapshot(self):
        """
        Get current shuttle state snapshot (thread-safe).
        
        Returns:
            dict: Current shuttle position and state
        """
        with self.lock:
            return {
                "row": self.row_num,
                "column": self.column_letter,
                "state": self.state,
                "command": self.active_command,
            }

    def _notify_callbacks(self):
        """Notify all callbacks of current state"""
        # Callbacks might be async or sync, caller handles dispatch
        # We pass snapshot data
        data = self.snapshot()
        for cb in self._callbacks:
            try:
                cb(data["row"], data["column"], data["state"], data["command"])
            except Exception as e:
                logging.error(f"[Shuttle] Callback error: {e}")

    def set_moving(self, column_letter, row_num, command):
        """
        Set shuttle to busy state at target position (LED is active).
        """
        with self.lock:
            logging.info(f"[Shuttle] Setting position and state to BUSY: {column_letter}{row_num}, command={command}")
            self.column_letter = column_letter
            self.row_num = row_num
            self.active_command = command
            self.state = "busy"
        self.save_to_db()
        self._notify_callbacks()

    def set_idle(self):
        """
        Set shuttle to idle state (LED turned OFF, operation complete).
        """
        with self.lock:
            logging.info(f"[Shuttle] Setting state to IDLE (LED OFF) at {self.column_letter}{self.row_num}")
            self.state = "idle"
            self.active_command = None
        self.save_to_db()
        self._notify_callbacks()

    def set_error(self):
        """Set shuttle to error state (operation failed)"""
        with self.lock:
            logging.error(f"[Shuttle] Setting state to ERROR at {self.column_letter}{self.row_num}")
            self.state = "error"
        self.save_to_db()
        self._notify_callbacks()

    def reset_home(self):
        """
        Explicitly reset shuttle state to Home (A7).
        """
        with self.lock:
            logging.info("[Shuttle] MANUAL RESET to Home (A7)")
            self.row_num = 7
            self.column_letter = "A"
            self.state = "idle"
            self.active_command = None
        self.save_to_db()
        self._notify_callbacks()

    def return_to_dropoff(self):
        """
        Move shuttle to Drop-off position (virtual Row 0).
        Used after Retrieve operation completes.
        """
        with self.lock:
            logging.info("[Shuttle] Returning to DROP-OFF (A0)")
            # Set to Row 0 to trigger 'isAtDropOff' in frontend
            self.row_num = 0
            self.column_letter = "A"
            self.state = "idle"
            self.active_command = None
        self.save_to_db()
        self._notify_callbacks()
