"""
Hydraulic System Data Reader
Reads and displays real-time data from hydraulic system OPC UA variables
"""

from opcua import Client
import time

SERVER_URL = "opc.tcp://10.10.14.113:4840"

# Hydraulic system monitoring variables
HYDRAULIC_DATA_TAGS = {
    # Assembly operations (command outputs)
    "bearing_operation": "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Bering_On",
    "shaft_operation": "|var|AX-308EA0MA1P.Application.PLC_PRG.Opration_Shaft_On",

    # Position / Motion (keeping some monitoring variables)
    "displacement_mm": "|var|AX-308EA0MA1P.Application.GVL.mm",

    # Vice state
    "vice_open": "|var|AX-308EA0MA1P.Application.GVL.open",
    "vice_close": "|var|AX-308EA0MA1P.Application.GVL.Close",

    # Safety outputs
    "buzzer": "|var|AX-308EA0MA1P.Application.PLC_PRG.output06",

    # Safety light stack
    "light_red": "|var|AX-308EA0MA1P.Application.PLC_PRG.Red",
    "light_orange": "|var|AX-308EA0MA1P.Application.PLC_PRG.Orange",
    "light_green": "|var|AX-308EA0MA1P.Application.PLC_PRG.Relay4",

    # Safety curtain
    "safety_curtain": "|var|AX-308EA0MA1P.Application.GVL.Buzzer"
}


def read_node_info(client, tag_name, node_id):
    """Read detailed information about an OPC UA node"""
    try:
        node = client.get_node(f"ns=4;s={node_id}")
        
        # Get value
        value = node.get_value()
        
        # Get data type
        data_type = node.get_data_type_as_variant_type()
        
        # Get node class
        node_class = node.get_node_class()
        
        return {
            "tag": tag_name,
            "node_id": node_id,
            "value": value,
            "data_type": str(data_type),
            "node_class": str(node_class),
            "timestamp": time.time()
        }
    except Exception as e:
        return {
            "tag": tag_name,
            "node_id": node_id,
            "error": str(e)
        }

def continuous_monitor(client, interval=1.0):
    """Continuously monitor and display hydraulic data"""
    print("\n" + "="*80)
    print("HYDRAULIC SYSTEM - CONTINUOUS MONITORING")
    print("="*80)
    print("Press Ctrl+C to stop\n")
    
    try:
        while True:
            print(f"\n[{time.strftime('%H:%M:%S')}] Hydraulic System Status:")
            print("-" * 80)
            
            for tag_name, node_id in HYDRAULIC_DATA_TAGS.items():
                try:
                    node = client.get_node(f"ns=4;s={node_id}")
                    value = node.get_value()
                    print(f"  {tag_name:10} → {value}")
                except Exception as e:
                    print(f"  {tag_name:10} → ERROR: {e}")
            
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n\nMonitoring stopped by user.")

def main():
    client = Client(SERVER_URL)
    
    try:
        print(f"Connecting to OPC UA server at {SERVER_URL}...")
        client.connect()
        print("Connected successfully!\n")
        
        # Initial discovery - read all nodes once with detailed info
        print("="*80)
        print("INITIAL NODE DISCOVERY")
        print("="*80)
        
        for tag_name, node_id in HYDRAULIC_DATA_TAGS.items():
            info = read_node_info(client, tag_name, node_id)
            print(f"\n{tag_name}:")
            for key, val in info.items():
                print(f"  {key:15} : {val}")
        
        print("\n" + "="*80)
        
        # Ask user if they want continuous monitoring
        choice = input("\nStart continuous monitoring? (y/n): ").strip().lower()
        if choice == 'y':
            continuous_monitor(client, interval=1.0)
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        client.disconnect()
        print("\nDisconnected from OPC UA server.")

if __name__ == "__main__":
    main()
