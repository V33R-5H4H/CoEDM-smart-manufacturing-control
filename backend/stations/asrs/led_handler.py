import logging
from asyncua import ua

class LEDHandler:
    """
    OPC-UA subscription handler for LED state changes.
    
    This handler receives notifications from the OPC-UA server when
    LED node values change and forwards them to the LED service.
    """
    
    def __init__(self, led_service, node_to_tag: dict):
        """
        Initialize LED handler with reference to LED service.
        
        Args:
            led_service: LEDService instance to update on changes
            node_to_tag: Dictionary mapping node ID strings to tag names
        """
        self.led_service = led_service
        self.node_to_tag = node_to_tag
        logging.info("[LED Handler] Initialized")
    
    def datachange_notification(self, node, val, data):
        """
        Called automatically by OPC-UA client when subscribed LED node value changes.
        
        Args:
            node: OPC-UA node that changed
            val: New value of the node
            data: Additional data from OPC-UA server
        """
        try:
            # Get the string representation of the node ID
            node_id = node.nodeid.to_string()
            
            # Look up the tag name from node ID (e.g., "ledA1")
            tag = self.node_to_tag.get(node_id)
            
            if not tag:
                logging.warning(f"[LED Handler] Unknown node: {node_id}")
                return
            
            if tag == "saftey":
                # Route native safety curtain state change.
                # Invert logic: True from PLC = Safe (Normally Closed), False = Broken/Interrupted
                self.led_service.update_safety(not bool(val))
                return
            
            # Extract box ID from tag: "ledA1" → "A1"
            box_id = tag.replace("led", "")
            
            # Convert value to boolean (LED ON/OFF)
            active = bool(val)
            
            # Update the LED service with new state
            self.led_service.update_led(box_id, active)
            
        except Exception as e:
            logging.error(f"[LED Handler] Notification error: {e}")

