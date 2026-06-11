# Endpoints Reference
## CoEDM Smart Manufacturing Control API — v1.0.0

**Base URL**: `http://localhost:8000`
**Interactive Docs**: `http://localhost:8000/docs`

---

## Table of Contents

| Tag | Endpoints |
|-----|-----------|
| [Health](#health) | `GET /api/health` |
| [ASRS Control](#asrs-control) | 7 endpoints — run commands, shuttle, LED, connection lifecycle |
| [Assembly Control](#assembly-control) | 4 endpoints — run commands, connection lifecycle |
| [MIRAC](#mirac) | 5 endpoints — vibit data, read rate, connection lifecycle |
| [TRIAC](#triac) | 3 endpoints — connection lifecycle |
| [TM Cobot Control](#tm-cobot-control) | 2 endpoints |
| [ASRS Shuttle](#asrs-shuttle) | 1 endpoint — current shuttle position |
| [Boxes](#boxes) | 5 endpoints — CRUD for storage grid boxes |
| [Items](#items) | 6 endpoints — CRUD for item master catalog |
| [SubCompartments](#subcompartments) | 7 endpoints — inventory slot management + physical ASRS ops |
| [Orders (ASRS)](#orders-asrs) | 5 endpoints — order CRUD and status management |
| [Transactions](#transactions) | 5 endpoints — append-only ASRS operation log |
| [ASRS Retrieval Queue](#asrs-retrieval-queue) | 3 endpoints — FIFO job queue |
| [Machines](#machines) | 2 endpoints — machine and sensor registry |
| [Users](#users) | 2 endpoints — user management |
| [Events & Alarms](#events--alarms) | 3 endpoints — event log and connection history |
| [Telemetry & Time-Series](#telemetry--time-series) | 1 endpoint — historical telemetry |
| [E-Commerce](#e-commerce) | 11 endpoints — public portal, auth, and admin |

---

## Health

### `GET /api/health`
System-wide health check. Reports database and all OPC-UA connection states.

**Response `200`**
```json
{
  "database": "ok | error",
  "asrs_plc": "connected | disconnected",
  "assembly_plc": "connected | disconnected",
  "mirac_plc": "connected | disconnected",
  "triac_plc": "connected | disconnected"
}
```

---

## ASRS Control

### `POST /api/control/asrs/run`
Execute an ASRS shuttle command.

**Request Body**
```json
{ "command": "A1" }
```
- `"A1"` — retrieve box at Row A, Col 1
- `"A1S"` — store into box at Row A, Col 1
- Valid rows: `A–E`, valid columns: `1–7`

**Response `200`**
```json
{ "success": true, "command": "A1", "result": { ... } }
```

---

### `GET /api/control/asrs/shuttle_state`
Get the current in-memory shuttle state.

**Response `200`**
```json
{ "state": "idle | moving | busy | error | home", "last_command": "A1", ... }
```

---

### `POST /api/control/asrs/home`
Reset shuttle to home position (Row A7). Dispatches physical PLC command if connected.

**Response `200`**
```json
{ "success": true, "message": "Shuttle reset to home" }
```

---

### `POST /api/control/asrs/connect`
Establish OPC-UA connection to the ASRS PLC.

---

### `POST /api/control/asrs/disconnect`
Cleanly disconnect the ASRS OPC-UA session.

---

### `GET /api/control/asrs/connection-status`
Check OPC-UA connection status.

**Response `200`**
```json
{ "connected": true }
```

---

### `GET /api/control/asrs/led-status`
Get current LED states for all 35 boxes in the 5×7 grid.

**Response `200`**
```json
{
  "K1_1_R1": true,
  "K1_1_R2": false,
  "...": "..."
}
```
`true` = LED is ON (box is busy/being accessed), `false` = LED is OFF (box is available).

---

## Assembly Control

### `POST /api/control/assembly/run`
Execute an Assembly (hydraulic press) control command.

**Request Body**
```json
{ "command": "BEARING_ON" }
```
Valid commands: `BEARING_ON`, `BEARING_OFF`, `SHAFT_ON`, `SHAFT_OFF`, `VICE_OPEN`, `VICE_CLOSE`

---

### `POST /api/control/assembly/connect`
Establish OPC-UA connection to the Assembly PLC.

---

### `POST /api/control/assembly/disconnect`
Disconnect from the Assembly OPC-UA session.

---

### `GET /api/control/assembly/connection-status`
Check Assembly PLC connection status.

---

## MIRAC

### `GET /api/control/mirac/vibit-data`
Get current VIBIT sensor readings from the MIRAC station.

**Query Parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `sensor` | string | No | `vibit1`, `vibit2`, or `vibit3`. Omit for all three combined. |

**Response `200`**
```json
{
  "vibit1": { "x_rms_acc": 0.12, "y_rms_acc": 0.08, "temperature": 42.1, "rpm": 1200, "..." : "..." },
  "vibit2": { "..." : "..." },
  "vibit3": { "..." : "..." }
}
```

---

### `POST /api/control/mirac/config/read-rate`
Set the Modbus poll interval for VibIT sensor reads.

**Request Body**
```json
{ "interval_ms": 500 }
```
Recommended values: `100` (responsive), `500` (safe default), `1000` (low load). Range: `100–5000`.

---

### `GET /api/control/mirac/connection-status`
Check OPC-UA and Modbus gateway connection status.

---

### `POST /api/control/mirac/connect`
Connect to the MIRAC OPC-UA server.

---

### `POST /api/control/mirac/disconnect`
Disconnect from the MIRAC OPC-UA server.

---

## TRIAC

### `GET /api/control/triac/connection-status`
Check TRIAC OPC-UA connection status.

---

### `POST /api/control/triac/connect`
Connect to the TRIAC OPC-UA server.

---

### `POST /api/control/triac/disconnect`
Disconnect from the TRIAC OPC-UA server.

---

## TM Cobot Control

### `GET /api/control/cobot/connection-status`
Verify if the Cobot TCP port (`10.10.14.106:5890`) is open and reachable.

---

### `POST /api/control/cobot/trigger`
Send a TM Script block to the cobot.

**Request Body**
```json
{ "script": "ScriptExit()" }
```

---

## ASRS Shuttle

### `GET /api/asrs/shuttle`
Get the current shuttle position and state from the database (most recent `shuttle_movements` row).

**Response `200`**
```json
{
  "machine_id": "asrs",
  "last_updated": "2026-06-11T05:00:00Z",
  "last_command": "C3",
  "current_state": "idle",
  "to_row": 3,
  "to_col": "C",
  "duration_ms": 4200
}
```

---

## Boxes

### `GET /api/asrs-data/boxes`
Retrieve all 35 grid boxes, enriched with:
- Filled subcompartment count
- LED active status (whether a box is currently being accessed)

---

### `POST /api/asrs-data/boxes`
Create a new box.

**Request Body**
```json
{ "boxId": "A1", "columnName": "A", "rowNumber": 1 }
```

---

### `GET /api/asrs-data/boxes/empty-compartments`
Retrieve all boxes that have at least one empty sub-compartment slot.

---

### `GET /api/asrs-data/boxes/{box_id}`
Retrieve a specific box by its ID (e.g., `A1`, `C3`).

---

### `DELETE /api/asrs-data/boxes/{box_id}`
Delete a box and cascade-delete its sub-compartments.

---

## Items

### `GET /api/asrs-data/items`
Retrieve all items from the item master catalog.

---

### `POST /api/asrs-data/items`
Create a new item in the catalog.

**Request Body**
```json
{ "itemId": "1001", "name": "Bearing 6205", "description": "Deep groove ball bearing" }
```

---

### `GET /api/asrs-data/items/available/with-count`
Get all items that have at least one occupied compartment, along with their total in-stock count.

---

### `GET /api/asrs-data/items/{item_id}`
Retrieve a specific item by ID.

---

### `DELETE /api/asrs-data/items/{item_id}`
Delete an item from the catalog.

---

### `GET /api/asrs-data/items/{item_id}/locations`
Get all storage locations (compartment IDs) for a given item.

---

### `GET /api/asrs-data/items/{item_id}/exists`
Check if an item ID already exists in the catalog. Returns `true` or `false`.

---

## SubCompartments

### `GET /api/asrs-data/subcompartments`
Get all 210 sub-compartments across the 5×7×6 grid.

---

### `POST /api/asrs-data/subcompartments`
Create a new sub-compartment record.

---

### `GET /api/asrs-data/subcompartments/{place}`
Get a specific sub-compartment by its place code.

**Path Parameter**: `place` — e.g., `A1a`, `C3b`

---

### `DELETE /api/asrs-data/subcompartments/{place}`
Delete a sub-compartment record.

---

### `PUT /api/asrs-data/subcompartments/{place}/status`
Update the status of a sub-compartment.

**Request Body**
```json
{ "status": "empty", "itemId": null }
```

---

### `POST /api/asrs-data/subcompartments/operations/add-product`
**Physical + DB Operation**: Store a product in the ASRS.

1. Sends a store command (`{boxId}S`) to the ASRS PLC.
2. If PLC succeeds → marks the sub-compartment as `occupied` in the database.
3. Logs the transaction.

**Request Body**
```json
{ "boxId": "A1", "subId": "a", "itemId": "1001" }
```

---

### `POST /api/asrs-data/subcompartments/operations/retrieve-product`
**Physical + DB Operation**: Retrieve a product from the ASRS.

Supports two modes:
- **By Quantity**: System finds optimal locations automatically.
- **By Location**: Retrieve from a specific compartment.

**Request Body (By Quantity)**
```json
{ "itemId": "1001", "quantity": 2 }
```

**Request Body (By Location)**
```json
{ "itemId": "1001", "quantity": 1, "boxId": "A1", "subId": "a" }
```

---

### `POST /api/asrs-data/subcompartments/operations/test-asrs`
Test the ASRS connection by sending a raw command.

**Request Body**
```json
{ "command": "A1" }
```

---

## Orders (ASRS)

### `GET /api/asrs-data/orders`
Get all orders with item summary.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | `100` | Maximum number of orders to return |

---

### `POST /api/asrs-data/orders`
Create a new order record (does not trigger ASRS retrieval — use `/api/ecom/orders` for full fulfillment).

---

### `GET /api/asrs-data/orders/{order_id}`
Get a specific order with detailed line items.

---

### `GET /api/asrs-data/orders/status/{status}`
Get all orders filtered by status.

**Path Parameter**: `status` — `pending`, `processing`, `shipped`, `delivered`, `cancelled`

---

### `GET /api/asrs-data/orders/stats/summary`
Get aggregated order statistics (counts by status, total values).

---

### `PUT /api/asrs-data/orders/{order_id}/status`
Update the fulfillment status of an order.

**Request Body**
```json
{ "status": "shipped" }
```

---

## Transactions

### `GET /api/asrs-data/transactions`
Get all ASRS transactions with optional sorting and filtering.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `sort` | string | `id_asc` | `id_asc`, `newest_first`, `added_only`, `retrieved_only` |
| `limit` | integer | `100` | Max number of results |

---

### `POST /api/asrs-data/transactions`
Manually create a single transaction record.

**Request Body**
```json
{ "item_id": 1001, "action": "add", "subcom_place": "A1a" }
```

---

### `POST /api/asrs-data/transactions/batch`
Create multiple transaction records atomically.

**Request Body**
```json
{
  "transactions": [
    { "item_id": 1001, "action": "retrieve", "subcom_place": "A1a" },
    { "item_id": 1002, "action": "retrieve", "subcom_place": "B2b" }
  ]
}
```

---

### `GET /api/asrs-data/transactions/item/{item_id}`
Get all transactions for a specific item.

---

### `GET /api/asrs-data/transactions/{tran_id}`
Get a specific transaction by its numeric ID.

---

## ASRS Retrieval Queue

### `GET /api/asrs-data/queue`
Get all items in the retrieval queue.

**Query Parameters**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | No | Filter by `pending`, `processing`, `completed`, `cancelled` |

---

### `POST /api/asrs-data/queue`
Push a new retrieval job onto the queue.

**Request Body** — `QueueCreate`
```json
{
  "item_id": 1001,
  "requested_by": "uuid-of-user (optional)",
  "priority": 5
}
```
Priority: `1` = highest urgency, `10` = lowest.

---

### `DELETE /api/asrs-data/queue`
Clear all `pending` and `processing` items from the queue. Restores inventory stock if needed.

---

## Machines

### `GET /api/data/machines`
Retrieve all machines in the factory registry.

---

### `GET /api/data/machines/{machine_id}/sensors`
Retrieve all sensors attached to a specific machine.

**Path Parameter**: `machine_id` — e.g., `mirac`, `asrs`, `assembly`, `triac`

---

## Users

### `GET /api/data/users`
Retrieve all system users (operators, admins, etc.).

---

### `POST /api/data/users`
Create a new system user.

**Request Body** — `UserCreate`
```json
{
  "username":  "jdoe",
  "email":     "j.doe@coedm.com",
  "full_name": "John Doe",
  "role":      "operator"
}
```
Valid roles: `admin`, `operator`, `supervisor`, `viewer`.

---

## Events & Alarms

### `GET /api/data/events`
Retrieve historical machine events and alarms.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `machine_id` | string | None | Filter by machine (e.g., `mirac`) |
| `severity` | string | None | Filter by `info`, `warning`, `critical` |
| `limit` | integer | `50` | Max results (1–500) |

---

### `POST /api/data/events`
Manually log a new machine event.

**Request Body** — `EventCreate`
```json
{
  "machine_id": "assembly",
  "event_type": "alarm",
  "severity":   "critical",
  "title":      "Vice failed to close",
  "payload":    { "displacement_mm": 0.0 }
}
```

---

### `GET /api/data/events/connections`
Retrieve the connect/disconnect history for all sensors.

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | `50` | Max results (1–500) |

---

## Telemetry & Time-Series

### `GET /api/data/telemetry/{machine_id}`
Retrieve historical time-series telemetry data for a machine.

**Path Parameter**: `machine_id` — `mirac`, `triac`, `assembly`, `asrs`

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | integer | `100` | Max rows (1–1000). Most recent rows returned. |

---

## E-Commerce

### Auth

#### `POST /api/ecom/auth/register`
Register a new customer account.

#### `POST /api/ecom/auth/login`
Authenticate an existing customer. Returns a JWT Bearer token.

#### `GET /api/ecom/auth/me`
`🔒 Auth required` — Return the currently logged-in customer's profile.

#### `POST /api/ecom/auth/forgot-password`
Generate a stateless reset token (logged to terminal for dev/staging use).

#### `POST /api/ecom/auth/reset-password`
Validate a reset token and update the customer's password.

---

### Products (Public)

#### `GET /api/ecom/products`
List all `finished` items that have at least 1 unit in stock. Aggregates quantity across all occupied compartments.

#### `GET /api/ecom/products/{item_id}`
Return a single product with compartment-level stock detail.

---

### Orders

#### `GET /api/ecom/orders`
`🔒 Auth required` — Return all orders belonging to the logged-in customer.

#### `POST /api/ecom/orders`
`🔒 Auth required` — Place an order. **Triggers immediate ASRS retrieval** for each line item.
- If the ASRS PLC is connected: the physical shuttle will move to fetch the boxes.
- If the ASRS PLC is offline: the order is recorded as `pending` for manual dispatch later.

**Request Body** — `PlaceOrderRequest`
```json
{
  "shipping_address": "123 Factory Rd",
  "items": [
    { "item_id": 1, "quantity": 2 }
  ]
}
```

#### `GET /api/ecom/orders/{order_id}`
`🔒 Auth required` — Track a specific order by ID. Only the owning customer can access it.

#### `GET /api/ecom/orders/recent/feed`
Public (no auth). Returns the last 20 individual order items for the ASRS dashboard live feed widget.

---

### Admin

#### `GET /api/ecom/admin/users`
`🔒 Admin auth required` — Fetch all registered e-commerce customers.

#### `GET /api/ecom/admin/orders`
`🔒 Admin auth required` — Fetch all orders including customer details.

#### `GET /api/ecom/admin/inventory`
`🔒 Admin auth required` — Fetch all items and their exact ASRS bin locations.
