# ASRS & Assembly Station Data Telemetry Guide

This document details the exact structure, update rates, and definitions of the data streaming from the OPC-UA PLCs into the frontend application. 

Both stations utilize a **FastAPI backend** that translates raw OPC-UA Node IDs into structured JSON payloads. The frontend consumes this data primarily via **WebSockets** for real-time monitoring and **REST APIs** for command execution.

---

## 1. ASRS (Automated Storage & Retrieval System)

The ASRS station streams two main types of data: the current position/status of the moving shuttle, and the status of the LED indicators attached to the storage boxes.

### Real-Time Data Stream (WebSocket)
**Endpoint:** `ws://<API_HOST>:<API_PORT>/api/control/asrs/ws/led-status`
**Update Rate:** Event-driven (broadcasts only when a state changes)

The ASRS WebSocket emits JSON messages with a `type` envelope to distinguish between different telemetry events.

#### A. Initial Snapshot Event (`type: "snapshot"`)
Sent immediately when a frontend client connects to sync the current state of all LEDs.
```json
{
    "type": "snapshot",
    "states": {
        "A1": true,
        "A2": false,
        "B1": false,
        // ... all 35 boxes
    }
}
```

#### B. Shuttle State Event (`type: "shuttle"`)
Broadcast whenever the shuttle moves or changes its operational state.
```json
{
    "type": "shuttle",
    "payload": {
        "row": 7,              // Integer: 1 to 7
        "column": "A",         // String: "A", "B", "C", "D", or "E"
        "state": "idle",       // String: "idle", "moving", "busy", or "error"
        "command": null        // String or null: The raw PLC command being executed (e.g., "A1")
    }
}
```
* **Usage:** Used by the frontend `useLEDMonitoring` hook to render the shuttle's current coordinates on the 2D grid and display its status badge.

#### C. LED Change Event (`type: "led"`)
Broadcast whenever a specific box's LED turns on (indicating the box is being accessed) or off.
```json
{
    "type": "led",
    "payload": {
        "box_id": "A1",        // String: The coordinate of the box
        "active": true         // Boolean: True if the LED is illuminated
    }
}
```

### REST Control API
**Endpoint:** `POST /api/control/asrs/run`
**Payload:** `{"command": "A1"}` (Retrieve box A1) or `{"command": "A1S"}` (Store box A1)

---

## 2. Assembly Station (Hydraulic Press)

The Assembly station streams continuous sensor data reflecting the physical state of the hydraulic cylinder, the Vice, and safety mechanisms.

### Real-Time Data Stream (WebSocket)
**Endpoint:** `ws://<API_HOST>:<API_PORT>/api/control/assembly/ws/hydraulic-data`
**Update Rate:** Continuous polling at **1 Hz** (1 update per second)

Unlike the ASRS which is event-driven, the Hydraulic station continuously broadcasts a rich, nested JSON object containing all sensor readings.

#### Data Payload Structure
```json
{
    "timestamp": 1716112345.67,
    "assembly": {
        "bearing": true,       // Boolean: True if a Bearing is loaded in the press
        "shaft": false         // Boolean: True if a Shaft is loaded in the press
    },
    "position": {
        "displacement_mm": 45.2 // Float: Real-time extension of the hydraulic cylinder in millimeters
    },
    "vice": {
        "open": true,          // Boolean: True if the Vice clamp is fully open
        "close": false         // Boolean: True if the Vice clamp is fully closed
    },
    "safety": {
        "buzzer": false,       // Boolean: True if the safety alarm buzzer is active
        "curtain": false,      // Boolean: True if the optical safety light-curtain is breached
        "lights": {
            "red": false,      // Boolean: System fault / Danger
            "orange": true,    // Boolean: System in operation / Warning
            "green": false     // Boolean: System idle / Safe
        }
    }
}
```

#### Detailed Sensor Breakdown:
* **`position.displacement_mm`**: The most critical data point. Used by the frontend `Assembly.jsx` canvas to animate the physical extension of the hydraulic piston rod in real-time. The frontend applies exponential smoothing (`0.08` factor) to this value to ensure 60fps fluid animation between the 1Hz network updates.
* **`assembly`**: Detects the presence of workpieces.
* **`safety.curtain`**: If `true`, the frontend assembly visualization immediately lowers its opacity to `0.3` and disables pointer events to simulate a physical lockout.

### REST Control API
**Endpoint:** `POST /api/control/assembly/run`
**Payload:** `{"command": "BEARING_ON"}` or `{"command": "SHAFT_ON"}`
* **Usage:** Triggers the physical hydraulic press cycle for the specified workpiece.
