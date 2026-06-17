import logging
from typing import Dict, Callable, Set
import asyncio

# Define the grid layout for the ASRS system
LETTERS = ["A", "B", "C", "D", "E"]
NUMBERS = range(1, 8)

class LEDService:
    """
    Service for managing LED states from OPC-UA server.
    
    This service:
    - Maintains current state of all box LEDs (active/inactive)
    - Tracks previous states for edge detection (True→False transitions)
    - Notifies registered callbacks when LED states change
    - Provides query methods for LED status
    - Bridges sync OPC UA callbacks to async WebSocket broadcasts
    """
    
    def __init__(self):
        # Initialize LED state dictionary: {"A1": False, "A2": False, ...}
        # False = LED OFF (box not busy), True = LED ON (box busy)
        self.led_state: Dict[str, bool] = {
            f"{l}{n}": False for l in LETTERS for n in NUMBERS
        }
        
        # Track previous LED states for edge detection
        # This allows callbacks to detect True→False (operation complete)
        self.prev_led_state: Dict[str, bool] = {
            f"{l}{n}": False for l in LETTERS for n in NUMBERS
        }
        
        # Set of callback functions to notify on LED changes
        self._callbacks: Set[Callable] = set()
        
        # Safety curtain state (from PLC 'saftey' tag)
        self.safety_curtain = False
        self.prev_safety_curtain = False
        self._safety_callbacks: Set[Callable] = set()
        
        # Maps OPC-UA node IDs to tag names (e.g., node_id -> "ledA1")
        self.node_to_tag: Dict[str, str] = {}
        
        # FastAPI event loop reference for scheduling async callbacks from sync context
        self.loop: asyncio.AbstractEventLoop = None
        
        logging.info("[LED Service] Initialized with 35 box locations and safety monitoring")
    
    def set_event_loop(self, loop: asyncio.AbstractEventLoop):
        """
        Set the FastAPI event loop for scheduling async callbacks.
        
        This is critical for bridging sync OPC UA callbacks to async WebSocket broadcasts.
        Must be called at app startup with the running event loop.
        
        Args:
            loop: The asyncio event loop from FastAPI
        """
        self.loop = loop
        logging.info("[LED Service] Event loop registered for async callback scheduling")
        
    def register_callback(self, callback: Callable):
        """
        Register a callback function to be notified when LED states change.
        
        Callback signature: callback(box_id: str, active: bool, prev: bool)
        - box_id: Box identifier (e.g., "A1")
        - active: Current LED state (True=ON, False=OFF)
        - prev: Previous LED state (for edge detection)
        
        Supports both sync and async callbacks.
        """
        self._callbacks.add(callback)
        logging.info(f"[LED Service] Registered callback: {callback.__name__}")
    
    def update_led(self, box_id: str, active: bool):
        """
        Update LED state for a specific box and notify all callbacks.
        
        Tracks state transitions for edge detection:
        - False → True: Operation started
        - True → False: Operation finished
        
        Called from OPC UA subscription thread (sync context).
        Schedules async callbacks on the FastAPI event loop.
        
        Args:
            box_id: Box identifier (e.g., "A1", "B3")
            active: True if LED is ON (box busy), False if OFF (box idle)
        """
        # Get previous state for edge detection
        prev_state = self.led_state.get(box_id, False)
        
        # Update previous state tracker
        self.prev_led_state[box_id] = prev_state
        
        # Update current state
        self.led_state[box_id] = active
        
        # Log state transitions
        if prev_state != active:
            if not prev_state and active:
                logging.info(f"[LED Service] {box_id} STARTED (False → True)")
            elif prev_state and not active:
                logging.info(f"[LED Service] {box_id} FINISHED (True → False)")
            else:
                logging.info(f"[LED Service] {box_id}: {prev_state} → {active}")
            
            # Notify callbacks with both current and previous state
            self._notify_callbacks(box_id, active, prev_state)
    
    def _notify_callbacks(self, box_id: str, active: bool, prev: bool):
        """
        Notify all registered callbacks about LED state change.
        
        Passes previous state to allow callbacks to detect edge transitions.
        
        Callbacks are responsible for their own async/sync handling.
        The main.py startup registers a callback that uses run_coroutine_threadsafe
        to bridge from this sync context to the async FastAPI event loop.
        """
        for callback in self._callbacks:
            try:
                # Call the callback directly (it handles its own async scheduling)
                callback(box_id, active, prev)
            except Exception as e:
                logging.error(f"[LED Service] Callback error: {e}", exc_info=True)


    
    def get_all_states(self) -> Dict[str, bool]:
        """
        Get current state of all LEDs.
        
        Returns:
            Dictionary mapping box_id to active state
        """
        return self.led_state.copy()
    
    def get_active_boxes(self) -> list:
        """
        Get list of boxes with active LEDs (busy boxes).
        
        Returns:
            List of box IDs where LED is ON
        """
        return [box for box, active in self.led_state.items() if active]

    def register_safety_callback(self, callback: Callable):
        """
        Register a callback function to be notified when the safety curtain state changes.
        
        Callback signature: callback(active: bool, prev: bool)
        """
        self._safety_callbacks.add(callback)
        logging.info(f"[LED Service] Registered safety callback: {callback.__name__}")

    def update_safety(self, active: bool):
        """
        Update safety curtain state and notify all registered safety callbacks.
        """
        prev = self.safety_curtain
        self.prev_safety_curtain = prev
        self.safety_curtain = active
        
        if prev != active:
            logging.info(f"[LED Service] Safety Curtain transition: {prev} → {active}")
            self._notify_safety_callbacks(active, prev)

    def _notify_safety_callbacks(self, active: bool, prev: bool):
        """
        Notify all registered safety callbacks.
        """
        for callback in self._safety_callbacks:
            try:
                callback(active, prev)
            except Exception as e:
                logging.error(f"[LED Service] Safety callback error: {e}", exc_info=True)


