# ASRS Order Fulfillment Sequence

This sequence diagram maps the chronological flow of messages between the external E-Commerce Portal and the internal manufacturing control system during an ASRS item retrieval.

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#ffffff",
    "primaryColor": "#ffffff",
    "primaryTextColor": "#1f2937",
    "primaryBorderColor": "#334155",
    "lineColor": "#64748b",
    "fontFamily": "Arial, Helvetica, sans-serif",
    "actorBkg": "#e0f2fe",
    "actorBorder": "#0369a1",
    "actorTextColor": "#0f172a",
    "signalColor": "#334155",
    "signalTextColor": "#1f2937",
    "noteBkgColor": "#fef3c7",
    "noteBorderColor": "#d97706",
    "noteTextColor": "#451a03",
    "activationBkgColor": "#dbeafe",
    "activationBorderColor": "#2563eb"
  }
}}%%
sequenceDiagram
    autonumber

    actor Ecom as E-Commerce Portal
    participant API as FastAPI Router
    participant Logic as ASRSLogic
    participant DB as Inventory DB (PostgreSQL)
    participant Ctrl as ASRSController (PLC)

    Ecom->>API: POST /ecom/orders (item_id, qty)

    rect rgb(248, 250, 252)
        note right of API: Phase 1: Reservation (under 50 ms response)
        API->>DB: INSERT into orders
        API->>DB: SELECT available subcompartments FOR UPDATE
        DB-->>API: Returns Box C3, Sub-slot a
        API->>DB: UPDATE status = 'reserved'
        API-->>Ecom: 200 OK (Order Confirmed, Box C3a)
    end

    rect rgb(239, 246, 255)
        note right of API: Phase 2: Physical Retrieval (Async/Background)
        API->>Logic: retrieve_from_specific_location(C3, a, item_id)
        Logic->>DB: Verify C3a is reserved and matches item
        DB-->>Logic: Validation OK

        Logic->>Ctrl: run(C3)
        activate Ctrl
        Ctrl->>Ctrl: Write C3 to OPC-UA command node
        Ctrl->>Ctrl: Poll shuttle state (max 90s)
        Ctrl-->>Logic: Success (Shuttle idle)
        deactivate Ctrl

        Logic->>DB: UPDATE status = 'empty', item_id = NULL
        Logic->>DB: INSERT transaction 'retrieve'
        Logic-->>API: Retrieval Success
    end
```

### Key Behaviors Highlighted:
- **Separation of Reservation and Retrieval**: The e-commerce API immediately reserves the item and responds to the portal so the user doesn't wait for the physical robot to move.
- **Row-Level Locking**: `FOR UPDATE SKIP LOCKED` ensures two concurrent orders cannot reserve the same physical sub-compartment.
- **Database Consistency Guarantee**: The `status = 'empty'` update ONLY happens if `ASRSController` returns success.
