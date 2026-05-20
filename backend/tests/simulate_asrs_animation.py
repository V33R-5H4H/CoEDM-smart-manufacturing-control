import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Configure logging to show beautiful monospaced console outputs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)

app = FastAPI(title="AS/RS High-Fidelity Animation Simulator")

# Enable CORS so the React frontend can talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global simulation state
simulation_shuttle = {
    "row": 7,
    "column": "A",
    "state": "idle",
    "command": None
}

simulation_leds = {f"{c}{r}": False for c in "ABCDE" for r in range(1, 8)}

@app.get("/api/control/asrs/connection-status")
async def connection_status():
    return {"connected": True}

@app.get("/api/control/asrs/shuttle_state")
async def get_shuttle_state():
    return {
        "row": simulation_shuttle["row"],
        "column": simulation_shuttle["column"],
        "state": simulation_shuttle["state"],
        "command": simulation_shuttle["command"]
    }

# Dynamic mock boxes endpoint to render the compartment grid beautifully
@app.get("/api/asrs-data/boxes")
async def get_boxes():
    enriched = []
    for c in "ABCDE":
        for r in range(1, 8):
            box_id = f"{c}{r}"
            # Seed some dynamic capacity counts (filled_count = 0, 1, or 2) for visuals
            filled_val = 0
            if (r + ord(c)) % 3 == 0:
                filled_val = 1
            elif (r + ord(c)) % 5 == 0:
                filled_val = 2
                
            enriched.append({
                "box_id": box_id,
                "column_name": c,
                "row_number": r,
                "filled_count": filled_val,
                "led_active": simulation_leds.get(box_id, False)
            })
    return {"success": True, "count": len(enriched), "data": enriched}

# Mock items endpoints to prevent 404s and populate Items tab
@app.get("/api/asrs-data/items")
async def get_items():
    return {
        "success": True,
        "count": 3,
        "data": [
            {"item_id": "ITEM001", "name": "Industrial Gear Set", "description": "High-torque transmission gears"},
            {"item_id": "ITEM002", "name": "Hydraulic Valve Block", "description": "Directional control valve assembly"},
            {"item_id": "ITEM003", "name": "Vibration Damper", "description": "Elastomeric mount for machine base"}
        ]
    }

@app.get("/api/asrs-data/items/available/with-count")
async def get_available_items_with_count():
    return {
        "success": True,
        "count": 3,
        "data": [
            {"item_id": "ITEM001", "name": "Industrial Gear Set", "count": 12},
            {"item_id": "ITEM002", "name": "Hydraulic Valve Block", "count": 8},
            {"item_id": "ITEM003", "name": "Vibration Damper", "count": 15}
        ]
    }

# Mock transactions endpoint to prevent 404s and populate Transactions tab
@app.get("/api/asrs-data/transactions")
async def get_transactions(sort: str = "id_asc", limit: int = 100):
    return {
        "success": True,
        "count": 3,
        "data": [
            {
                "id": 1,
                "item_id": "ITEM001",
                "item_name": "Industrial Gear Set",
                "action": "added",
                "subcom_place": "C3a",
                "timestamp": "2026-05-20T12:00:00Z"
            },
            {
                "id": 2,
                "item_id": "ITEM002",
                "item_name": "Hydraulic Valve Block",
                "action": "added",
                "subcom_place": "A2b",
                "timestamp": "2026-05-20T12:05:00Z"
            },
            {
                "id": 3,
                "item_id": "ITEM001",
                "item_name": "Industrial Gear Set",
                "action": "retrieved",
                "subcom_place": "B1a",
                "timestamp": "2026-05-20T12:10:00Z"
            }
        ]
    }

# Hydraulic WS simulator to provide safety curtain state & avoid connection rejections
@app.websocket("/api/control/assembly/ws/hydraulic-data")
async def hydraulic_data_websocket(websocket: WebSocket):
    await websocket.accept()
    logging.info("🔩 Frontend dashboard connected to Hydraulic/Safety WebSocket simulator!")
    try:
        while True:
            # Broadcast safe curtain status (no breach)
            await websocket.send_text(json.dumps({
                "safety": {
                    "curtain": False,
                    "buzzer": False
                },
                "piston": {
                    "position": 0.0
                }
            }))
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        logging.info("🔌 Hydraulic WS client disconnected.")
    except Exception as e:
        logging.error(f"Error in Hydraulic WS: {e}")

@app.websocket("/api/control/asrs/ws/led-status")
async def led_status_websocket(websocket: WebSocket):
    await websocket.accept()
    logging.info("🔴 Frontend dashboard connected to ASRS WebSocket simulator!")
    
    # 1. Send initial snapshot
    await websocket.send_text(json.dumps({
        "type": "snapshot",
        "states": simulation_leds
    }))
    
    try:
        # Keep client connection alive in background
        asyncio.create_task(keep_alive(websocket))
        
        while True:
            # --- LOOP 1: RUN STORE SEQUENCE ---
            await asyncio.sleep(4)
            logging.info("======================================================================")
            logging.info("🚀 TRIGGERING SIMULATED STORE OPERATION TO CELL [C3] (Command: 'C3S')")
            logging.info("======================================================================")
            
            # Step 1: Immediate physical state change (PLC accepts command and lights LED immediately)
            # The destination LED C3 goes ON, and the shuttle enters 'busy' executing 'C3S' from A7.
            logging.info("[Simulated PLC] Target cell C3 LED goes ON instantly.")
            logging.info("[Simulated PLC] Shuttle state updated to busy, command='C3S', at A7.")
            
            await websocket.send_text(json.dumps({
                "type": "led",
                "payload": {"box_id": "C3", "active": True}
            }))
            await websocket.send_text(json.dumps({
                "type": "shuttle",
                "payload": {"row": 7, "column": "A", "state": "busy", "command": "C3S"}
            }))
            
            # Shadow State Intercept:
            # - Phase 1: Acknowledgement (200ms) - C3 LED is hidden in frontend
            # - Phase 2: Source Departure (400ms) - Source cell A7 blinks
            # - Phase 2.5: Shuttle departs source A7 to DROP_OFF (Row 1 -> Column A -> DROP_OFF)
            await asyncio.sleep(1)
            
            # Step 2: Physical shuttle moves to dropoff position on the PLC (Trow=0, Tcol=DROP_OFF)
            # The frontend is currently waiting at the dropoff station for 20 seconds.
            logging.info("[Simulated PLC] Shuttle arrived at DROP_OFF handoff station. Loading item...")
            await websocket.send_text(json.dumps({
                "type": "shuttle",
                "payload": {"row": 0, "column": "DROP_OFF", "state": "busy", "command": "C3S"}
            }))
            
            # Wait for the frontend loading phase to finish (20s PICKUP_TRANSIT)
            # The operator will see the trolley waiting at the left handoff station!
            logging.info("⏱️  Simulating 20-second item loading pause at drop-off station...")
            await asyncio.sleep(20)
            
            # Step 3: Physical shuttle transits from DROP_OFF to C3 target cell (2 steps)
            logging.info("[Simulated PLC] Item loaded. Shuttle heading to target cell C3 (Row 3, Col C).")
            await websocket.send_text(json.dumps({
                "type": "shuttle",
                "payload": {"row": 3, "column": "C", "state": "busy", "command": "C3S"}
            }))
            
            # Wait for Phase 3 (Transit, ~5s) and Phase 4 (Arrival Hold, 300ms) to complete visually
            await asyncio.sleep(6)
            
            # Step 4: Operation completed! Clear busy indicators.
            logging.info("[Simulated PLC] Store operation completed! Releasing shuttle and clearing LED.")
            await websocket.send_text(json.dumps({
                "type": "led",
                "payload": {"box_id": "C3", "active": False}
            }))
            await websocket.send_text(json.dumps({
                "type": "shuttle",
                "payload": {"row": 3, "column": "C", "state": "idle", "command": None}
            }))
            logging.info("✅ STORE operation visualization check complete!")
            
            
            # --- LOOP 2: RUN RETRIEVE SEQUENCE ---
            await asyncio.sleep(6)
            logging.info("======================================================================")
            logging.info("🚀 TRIGGERING SIMULATED RETRIEVE OPERATION FROM CELL [C3] (Command: 'C3')")
            logging.info("======================================================================")
            
            # Step 1: Immediate physical state change for retrieval
            # Destination LED C3 goes ON (busy flag), shuttle is busy with command 'C3' at C3.
            logging.info("[Simulated PLC] Target cell C3 LED goes ON instantly (busy).")
            logging.info("[Simulated PLC] Shuttle state updated to busy, command='C3', at C3.")
            await websocket.send_text(json.dumps({
                "type": "led",
                "payload": {"box_id": "C3", "active": True}
            }))
            await websocket.send_text(json.dumps({
                "type": "shuttle",
                "payload": {"row": 3, "column": "C", "state": "busy", "command": "C3"}
            }))
            
            # Shadow State Intercept:
            # - Phase 1: Acknowledgement (200ms) - C3 LED kept hidden
            # - Phase 2: Source Departure (400ms) - C3 cell blinks
            # - Phase 3: Transit directly from C3 to DROP_OFF (Row 3 -> Row 1 -> Column A -> DROP_OFF)
            await asyncio.sleep(1)
            
            # Step 2: Physical shuttle arrives at DROP_OFF on the PLC
            logging.info("[Simulated PLC] Shuttle arrived at DROP_OFF handoff station. Unloading item...")
            await websocket.send_text(json.dumps({
                "type": "shuttle",
                "payload": {"row": 0, "column": "DROP_OFF", "state": "busy", "command": "C3"}
            }))
            
            # Wait for Phase 3 transit and Phase 4 hold to complete
            await asyncio.sleep(6)
            
            # Step 3: Operation completed!
            logging.info("[Simulated PLC] Retrieve operation completed! Shuttle released at DROP_OFF.")
            await websocket.send_text(json.dumps({
                "type": "led",
                "payload": {"box_id": "C3", "active": False}
            }))
            await websocket.send_text(json.dumps({
                "type": "shuttle",
                "payload": {"row": 0, "column": "DROP_OFF", "state": "idle", "command": None}
            }))
            logging.info("✅ RETRIEVE operation visualization check complete!")
            logging.info("Resetting simulation loop in 8 seconds...\n")
            await asyncio.sleep(8)
            
    except WebSocketDisconnect:
        logging.info("🔌 Frontend dashboard disconnected from WebSocket simulator.")
    except Exception as e:
        logging.error(f"Error in WebSocket simulation: {e}")

async def keep_alive(websocket: WebSocket):
    try:
        while True:
            await websocket.receive_text()
    except:
        pass

if __name__ == "__main__":
    print("\n" + "="*70)
    print("      ★ AS/RS TWO-LAYER SHADOW STATE MOTION VISUALIZATION SIMULATOR ★")
    print("="*70)
    print("Instructions:")
    print("1. Stop the standard backend server if it is running (e.g. Ctrl+C on stop.py).")
    print("2. Run this script: python backend/tests/simulate_asrs_animation.py")
    print("3. Reload your React Dashboard in the browser.")
    print("4. Watch the console logs and match them with the beautiful, smooth")
    print("   orthogonal transits, wheel spins, rail-vibration hums, and delayed LED glows!")
    print("="*70 + "\n")
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
