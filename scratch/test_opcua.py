import asyncio
from asyncua import Client

async def test_mirac():
    url = "opc.tcp://10.10.14.102:4840"
    print(f"Connecting to {url}...")
    client = Client(url=url)
    try:
        await client.connect()
        print("Connected successfully!")
        node = client.get_node("ns=4;i=16")
        val = await node.read_value()
        print(f"Cycle Start: {val}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        try:
            await client.disconnect()
        except:
            pass

if __name__ == "__main__":
    asyncio.run(test_mirac())
