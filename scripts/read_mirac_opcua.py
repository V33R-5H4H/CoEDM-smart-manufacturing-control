import asyncio
from asyncua import Client

MIRAC_OPCUA_URL = "opc.tcp://10.10.14.102:4840"

MIRAC_DATA_TAGS = {
    # Status LEDs
    "led_red": "ns=4;i=8",
    "led_yellow": "ns=4;i=9",
    "led_green": "ns=4;i=10",
    
    # Spindle
    "spindle_speed": "ns=4;i=24",
    "spindle_temp": "ns=4;i=20",
    "spindle_vibration": "ns=4;i=22",
    
    # Tool Data
    "tool_number": "ns=4;i=13",
    "tool_temp": "ns=4;i=19",
    "tool_vibration": "ns=4;i=21",
    
    # Axes
    "x_axis_value": "ns=4;i=11",
    "z_axis_value": "ns=4;i=12",
    "x_axis_feed": "ns=4;i=14",
    "z_axis_feed": "ns=4;i=15",
    
    # Controls / state
    "cycle_start": "ns=4;i=16",
    "cycle_stop": "ns=4;i=17",
    "pneumatic_chuck": "ns=4;i=23"
}

async def read_mirac_data():
    print(f"Connecting to MIRAC OPC UA server at {MIRAC_OPCUA_URL}...")
    try:
        async with Client(url=MIRAC_OPCUA_URL) as client:
            print("Connected successfully! Press Ctrl+C to stop.\n")
            while True:
                print("--- MIRAC Data ---")
                for tag_name, node_id in MIRAC_DATA_TAGS.items():
                    try:
                        node = client.get_node(node_id)
                        value = await node.read_value()
                        print(f"{tag_name:20}: {value}")
                    except Exception as e:
                        print(f"{tag_name:20}: ERROR - {e}")
                print("------------------\n")
                await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped by user.")
        print(f"Failed to connect to OPC UA server: {e}")

if __name__ == "__main__":
    asyncio.run(read_mirac_data())
