# CoEDM Network Topology

This document details the specific IP addresses, network segments, and communication protocols used across the CoEDM Smart Manufacturing Control System hardware.

## Factory Subnet Map

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "background": "#ffffff",
    "primaryTextColor": "#1f2937",
    "lineColor": "#64748b",
    "fontFamily": "Arial, Helvetica, sans-serif",
    "fontSize": "14px",
    "clusterBkg": "#f8fafc",
    "clusterBorder": "#94a3b8",
    "edgeLabelBackground": "#ffffff"
  }
}}%%
flowchart TD
    subgraph Edge_Network["Edge Server Node"]
        direction TB
        Server["Edge Application Server<br/>IP: 10.10.14.1 (Gateway)"]
    end

    subgraph Factory_Subnet["CoEDM Lab Factory Subnet 10.10.14.0/24"]
        direction TB

        ASRS["ASRS PLC<br/>IP: 10.10.14.104<br/>Port: 4840"]
        Cobot["TM Cobot<br/>IP: 10.10.14.106<br/>Port: 5890"]
        Assembly["Assembly Station PLC<br/>IP: 10.10.14.113<br/>Port: 4840"]
        AMR["AMR Mobile Robot<br/>IP: 10.10.14.122<br/>Port: 502"]

        subgraph MIRAC_Cell["MIRAC CNC Cell"]
            MIRAC["MIRAC CNC Lathe<br/>IP: 10.10.14.102<br/>Port: 4840"]
            MiracGW["Modbus Gateway<br/>IP: 10.10.14.103<br/>Port: 502"]
            M_S1(("Spindle VibIT"))
            M_S2(("Tool VibIT"))
            M_S3(("Energy Meter"))

            MiracGW -- "RS-485" --- M_S1
            M_S1 --- M_S2
            M_S2 --- M_S3
            MIRAC -.-> MiracGW
        end

        subgraph TRIAC_Cell["TRIAC CNC Cell"]
            TRIAC["TRIAC CNC Mill<br/>IP: 10.10.14.124<br/>Port: 4840"]
            TriacGW["Modbus Gateway<br/>IP: 10.10.14.129<br/>Port: 502"]
            T_S1(("Spindle VibIT"))
            T_S2(("Tool VibIT"))
            T_S3(("Energy Meter"))

            TriacGW -- "RS-485" --- T_S1
            T_S1 --- T_S2
            T_S2 --- T_S3
            TRIAC -.-> TriacGW
        end
    end

    Server -- "OPC-UA (TCP)" --> MIRAC
    Server -- "OPC-UA (TCP)" --> ASRS
    Server -- "Raw TCP" --> Cobot
    Server -- "OPC-UA (TCP)" --> Assembly
    Server -- "Modbus TCP" --> AMR
    Server -- "OPC-UA (TCP)" --> TRIAC
    Server -- "Modbus TCP" --> MiracGW
    Server -- "Modbus TCP" --> TriacGW

    classDef edgeServer fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#1e3a8a
    classDef plc fill:#dcfce7,stroke:#15803d,stroke-width:1.5px,color:#14532d
    classDef robot fill:#fce7f3,stroke:#be185d,stroke-width:1.5px,color:#831843
    classDef gateway fill:#ffedd5,stroke:#c2410c,stroke-width:1.5px,color:#7c2d12
    classDef sensor fill:#f3f4f6,stroke:#4b5563,stroke-width:1.2px,color:#1f2937

    class Server edgeServer
    class MIRAC,ASRS,Assembly,TRIAC plc
    class Cobot,AMR robot
    class MiracGW,TriacGW gateway
    class M_S1,M_S2,M_S3,T_S1,T_S2,T_S3 sensor
```
