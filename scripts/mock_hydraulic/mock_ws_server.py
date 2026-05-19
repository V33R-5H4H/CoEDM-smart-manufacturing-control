import asyncio
import json
import websockets
from mock_hydraulic_data import generate_mock_hydraulic_data

PORT = 9000

async def stream_data(websocket):
    print("Client connected")
    try:
        while True:
            data = generate_mock_hydraulic_data()
            await websocket.send(json.dumps(data))
            await asyncio.sleep(1)  # 1 Hz update rate
    except websockets.ConnectionClosed:
        print("Client disconnected")

async def main():
    print(f"Mock Hydraulic WS Server running on ws://localhost:{PORT}")
    async with websockets.serve(stream_data, "0.0.0.0", PORT):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
