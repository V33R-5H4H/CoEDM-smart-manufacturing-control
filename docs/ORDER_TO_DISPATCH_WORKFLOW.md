# Manufacturing Workflow: Order-to-Dispatch

This diagram illustrates the sequential end-to-end manufacturing pipeline — tracing the path of a raw material from the moment a customer order is received to its final physical dispatch, routed through the various smart hardware stations in the CoEDM cell.

```mermaid
flowchart TD
    %% Professional Report Theme
    %%{init: {
      'theme': 'base',
      'themeVariables': {
        'primaryColor': '#ffffff',
        'primaryTextColor': '#1e293b',
        'primaryBorderColor': '#94a3b8',
        'lineColor': '#475569',
        'background': '#ffffff',
        'fontFamily': 'system-ui, sans-serif'
      }
    }}%%

    subgraph Phase1 [Phase 1: Order Initiation & Storage]
        direction LR
        Order(["Order Received<br/><small>(E-Commerce Portal)</small>"])
        ASRS["Storage Retrieval<br/><small>(Omron ASRS PLC)</small>"]
        Order -->|API Trigger| ASRS
    end

    subgraph Phase2 [Phase 2: Automated Transit & Prep]
        direction LR
        AMR1["Material Transport<br/><small>(AMR Navigation)</small>"]
        Assembly["Assembly & Prep<br/><small>(TM Cobot & Hydraulic Press)</small>"]
        AMR1 -->|Part Hand-off| Assembly
    end

    subgraph Phase3 [Phase 3: Machining & Quality Control]
        direction LR
        CNC["CNC Machining<br/><small>(MIRAC Lathe / TRIAC Mill)</small>"]
        QA["Quality Assurance<br/><small>(Automated Inspection Check)</small>"]
        CNC -->|Post-Process| QA
    end

    subgraph Phase4 [Phase 4: Outbound Logistics]
        direction LR
        AMR2["Outbound Transport<br/><small>(AMR Navigation)</small>"]
        Dispatch(["Final Dispatch<br/><small>(Shipping & Logistics)</small>"])
        AMR2 -->|Delivery| Dispatch
    end

    %% Phase Connections
    ASRS == "Raw Material" ===> AMR1
    Assembly == "Prepped Material" ===> CNC
    QA == "Finished Goods" ===> AMR2

    %% Styling
    classDef phase fill:#f8fafc,stroke:#cbd5e1,stroke-width:2px,color:#334155,rx:10,ry:10
    classDef startend fill:#f1f5f9,stroke:#475569,stroke-width:2px,color:#0f172a,rx:20,ry:20
    classDef step fill:#ffffff,stroke:#64748b,stroke-width:2px,color:#1e293b,rx:4,ry:4

    class Phase1,Phase2,Phase3,Phase4 phase
    class Order,Dispatch startend
    class ASRS,AMR1,Assembly,CNC,QA,AMR2 step
```
