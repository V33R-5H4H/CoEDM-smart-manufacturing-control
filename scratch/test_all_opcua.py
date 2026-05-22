import asyncio
from asyncua import Client

MIRAC_DATA_TAGS = {
    "led_red": "ns=4;i=8",
    "led_yellow": "ns=4;i=9",
    "led_green": "ns=4;i=10",
    "spindle_speed": "ns=4;i=24",
    "spindle_temp": "ns=4;i=20",
    "spindle_vibration": "ns=4;i=22",
    "tool_number": "ns=4;i=13",
    "tool_temp": "ns=4;i=19",
    "tool_vibration": "ns=4;i=21",
    "x_axis_value": "ns=4;i=11",
    "z_axis_value": "ns=4;i=12",
    "x_axis_feed": "ns=4;i=14",
    "z_axis_feed": "ns=4;i=15",
    "cycle_start": "ns=4;i=16",
    "cycle_stop": "ns=4;i=17",
    "pneumatic_chuck": "ns=4;i=23"
}

async def test_mirac():
    url = "opc.tcp://10.10.14.102:4840"
    client = Client(url=url)
    try:
        await client.connect()
        for tag, nid in MIRAC_DATA_TAGS.items():
            try:
                node = client.get_node(nid)
                val = await node.read_value()
                print(f"{tag}: {val}")
            except Exception as e:
                print(f"{tag}: ERROR ({e})")
    finally:
        try:
            await client.disconnect()
        except:
            pass

if __name__ == "__main__":
    asyncio.run(test_mirac())
