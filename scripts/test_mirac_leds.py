import time
from opcua import Client

SERVER_URL = "opc.tcp://10.10.14.102:4840"

# Node IDs based on controller definition
NODES = {
    "Red LED": "ns=4;i=8",
    "Yellow LED": "ns=4;i=9",
    "Green LED": "ns=4;i=10"
}

def main():
    print(f"Attempting to connect to MIRAC-PC at {SERVER_URL}...")
    client = Client(SERVER_URL)
    
    try:
        client.connect()
        print("Successfully connected!")
        
        while True:
            print("\n--- Reading LED Matrix ---", time.strftime("%H:%M:%S"))
            for name, node_id in NODES.items():
                try:
                    node = client.get_node(node_id)
                    value = node.get_value()
                    print(f"{name} ({node_id}): {value}")
                except Exception as e:
                    print(f"Failed to read {name}: {e}")
            
            # Wait 5 seconds before reading again
            time.sleep(5)
            
    except KeyboardInterrupt:
        print("\nStopping script...")
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        print("Disconnecting from server...")
        try:
            client.disconnect()
        except:
            pass
        print("Disconnected.")

if __name__ == "__main__":
    main()
