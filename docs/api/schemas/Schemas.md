# CoEDM API — Schemas Reference
## Version 1.0.0

All request and response bodies use `Content-Type: application/json`.

---

## Authentication

Protected endpoints use **Bearer Token** authentication.

Include the JWT token in the `Authorization` header:
```
Authorization: Bearer <token>
```
Tokens are obtained from `/api/ecom/auth/login` or `/api/ecom/auth/register`.

---

## Request Schemas

### `RegisterRequest`
Used by `POST /api/ecom/auth/register`.
```json
{
  "email":     "string (required) — customer email address",
  "full_name": "string (required) — customer display name",
  "password":  "string (required) — plain text, hashed server-side"
}
```

---

### `LoginRequest`
Used by `POST /api/ecom/auth/login`.
```json
{
  "email":    "string (required)",
  "password": "string (required)"
}
```

---

### `ForgotPasswordRequest`
Used by `POST /api/ecom/auth/forgot-password`.
```json
{
  "email": "string (required, email format)"
}
```

---

### `ResetPasswordRequest`
Used by `POST /api/ecom/auth/reset-password`.
```json
{
  "token":        "string (required) — stateless reset token from forgot-password",
  "new_password": "string (required)"
}
```

---

### `PlaceOrderRequest`
Used by `POST /api/ecom/orders`.
```json
{
  "shipping_address": "string (required)",
  "items": [
    {
      "item_id":  "integer (required) — references storage_items.item_id",
      "quantity": "integer (required, > 0)"
    }
  ]
}
```

---

### `CartItem`
Sub-schema used inside `PlaceOrderRequest.items`.
```json
{
  "item_id":  "integer (required)",
  "quantity": "integer (required)"
}
```

---

### `QueueCreate`
Used by `POST /api/asrs-data/queue`.
```json
{
  "item_id":      "integer (required) — references storage_items.item_id",
  "requested_by": "string (optional) — UUID of the requesting user",
  "priority":     "integer (optional, default: 5) — 1 = highest, 10 = lowest"
}
```

---

### `UserCreate`
Used by `POST /api/data/users`.
```json
{
  "username":  "string (required) — unique login handle",
  "email":     "string (required) — unique email address",
  "full_name": "string (required)",
  "role":      "string (optional, default: 'operator') — admin | operator | supervisor | viewer"
}
```

---

### `EventCreate`
Used by `POST /api/data/events`.
```json
{
  "machine_id": "string (required) — e.g. 'mirac', 'asrs', 'assembly'",
  "sensor_id":  "string (optional) — UUID of the specific sensor",
  "event_type": "string (required) — connect | disconnect | alarm | warning | mode_change | cycle_start | cycle_end | error | maintenance | info",
  "severity":   "string (optional, default: 'info') — info | warning | critical",
  "title":      "string (required) — short description of the event",
  "payload":    "object (optional) — arbitrary JSON metadata"
}
```

---

### Inline Request Bodies (Free-Form Object)
Some endpoints use a generic `object` payload without a strict schema. Here are the documented fields:

#### `POST /api/control/asrs/run`
```json
{ "command": "string — e.g. 'A1' (retrieve) or 'A1S' (store)" }
```

#### `POST /api/control/assembly/run`
```json
{ "command": "string — BEARING_ON | SHAFT_ON | BEARING_OFF | SHAFT_OFF | VICE_OPEN | VICE_CLOSE" }
```

#### `POST /api/asrs-data/boxes`
```json
{ "boxId": "string", "columnName": "A-E", "rowNumber": "1-7" }
```

#### `POST /api/asrs-data/items`
```json
{ "itemId": "string", "name": "string", "description": "string (optional)" }
```

#### `POST /api/asrs-data/orders`
```json
{
  "customer_name":    "string",
  "customer_email":   "string (optional)",
  "customer_phone":   "string (optional)",
  "shipping_address": "string (optional)",
  "items": [{ "item_id": "string", "quantity": "integer", "price": "float" }],
  "total_amount":  "float (optional — computed if omitted)",
  "order_status":  "string (optional, default: 'pending')"
}
```

#### `POST /api/asrs-data/subcompartments`
```json
{ "boxId": "string", "subId": "string (a-f)", "itemId": "string", "status": "string" }
```

#### `POST /api/asrs-data/subcompartments/operations/add-product`
```json
{ "boxId": "string — e.g. 'A1'", "subId": "string — sub-slot a-f", "itemId": "string — item ID" }
```

#### `POST /api/asrs-data/subcompartments/operations/retrieve-product`
```json
{
  "itemId":   "string (required)",
  "quantity": "integer (required)",
  "boxId":    "string (optional — specify for location-specific retrieval)",
  "subId":    "string (optional — specify for location-specific retrieval)"
}
```

#### `PUT /api/asrs-data/subcompartments/{place}/status`
```json
{ "status": "string — empty | occupied | reserved | error", "itemId": "string (optional)" }
```

#### `POST /api/asrs-data/transactions`
```json
{ "item_id": "integer", "action": "add | retrieve", "subcom_place": "string — e.g. 'A1a'" }
```

#### `POST /api/asrs-data/transactions/batch`
```json
{
  "transactions": [
    { "item_id": "integer", "action": "string", "subcom_place": "string" }
  ]
}
```

#### `PUT /api/asrs-data/orders/{order_id}/status`
```json
{ "status": "pending | processing | shipped | delivered | cancelled" }
```

#### `POST /api/control/mirac/config/read-rate`
```json
{ "interval_ms": "integer (required, 100–5000) — Modbus poll interval in milliseconds" }
```

#### `POST /api/control/cobot/trigger`
```json
{ "script": "string (optional, default: 'ScriptExit()') — TM Script string to execute" }
```

---

## Response Schemas

### `AuthResponse`
Returned by `POST /api/ecom/auth/register` and `POST /api/ecom/auth/login`.
```json
{
  "token":     "string — JWT Bearer token",
  "user_id":   "string — UUID",
  "email":     "string",
  "full_name": "string",
  "is_admin":  "boolean (default: false)"
}
```

---

### `HTTPValidationError`
Returned on `422 Unprocessable Entity` when request validation fails.
```json
{
  "detail": [
    {
      "loc":  ["body", "field_name"],
      "msg":  "string — human-readable error message",
      "type": "string — error type code"
    }
  ]
}
```

---

## WebSocket Endpoints

These are not REST endpoints but are used heavily by the frontend. They stream 10Hz JSON telemetry.

| WebSocket URL | Station | Message Types |
|---------------|---------|---------------|
| `ws://localhost:8000/api/control/mirac/ws/vibit-data` | MIRAC CNC Lathe | `snapshot`, `delta`, `heartbeat` |
| `ws://localhost:8000/api/control/triac/ws` | TRIAC CNC Mill | `snapshot`, `delta`, `heartbeat` |
| `ws://localhost:8000/api/control/assembly/ws` | Assembly Press | `snapshot`, `delta`, `heartbeat` |
| `ws://localhost:8000/api/control/asrs/ws` | ASRS Shuttle | `snapshot`, `delta`, `heartbeat` |

### WebSocket Message Format
```json
{
  "type":      "snapshot | delta | heartbeat",
  "timestamp": "ISO 8601 string",
  "data":      { "...station specific fields..." }
}
```

- **`snapshot`**: Full state payload. Sent immediately on connection and after reconnection.
- **`delta`**: Only the fields that changed since last broadcast. Sent at ~10 Hz when values differ.
- **`heartbeat`**: Empty data ping. Sent every ~5 seconds to keep the connection alive.
