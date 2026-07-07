# OPC UA Hardware Integration Guide

This guide serves as a reference for integrating the centralized CoEDM control software with the PLCs (Programmable Logic Controllers) driving the hardware stations via the OPC Unified Architecture (OPC-UA) protocol.

---

## 1. Server URLs

The backend establishes separate OPC-UA connections to the different stations on the factory floor. The default configuration endpoints are defined in the `.env` file and `backend/config.py`.

| Station | IP Address & Port | OPC-UA Connection URL |
|---------|-------------------|------------------------|
| **ASRS** | `10.10.14.104:4840` | `opc.tcp://10.10.14.104:4840` |
| **Hydraulic (Assembly)** | `10.10.14.113:4840` | `opc.tcp://10.10.14.113:4840` |
| **Mirac (CNC)** | `10.10.14.102:4840` | `opc.tcp://10.10.14.102:4840` |
| **Triac (CNC)** | `10.10.14.124:4840` | `opc.tcp://10.10.14.124:4840` |

---

## 2. OPC-UA Namespaces

All CoEDM PLCs use **Namespace Index 4** (`ns=4`) for exposing their telemetry tags and control variables.
- When querying nodes via the `asyncua` client, the prefix is always `ns=4;`.

---

## 3. PLC Tag Mappings

Depending on the PLC programming, the node identifiers are either strings (`s=...`) or integers (`i=...`).

### 3.1 ASRS and Assembly (String Nodes)
The ASRS and Assembly PLCs expose tags using String node identifiers. When passing tags to the `opcua_driver.py` or the specific broadcasters, you generally pass the string name, and the driver prefixes it automatically with `ns=4;s=`.

**Example Pattern:**
- Target Node: `ns=4;s=System.System_State`
- Calling in Python: `client.get_node("ns=4;s=System.System_State")` or simply providing the tag name.

### 3.2 Mirac CNC Station (Integer Nodes)
The Mirac CNC station maps its telemetry and control points to specific integer nodes. These are defined inside `backend/stations/mirac/cnc_mirac_station.py`.

#### Telemetry Tags (Sensors & State)
| Tag Description | Node ID |
|-----------------|---------|
| X Axis Value | `ns=4;i=11` |
| Z Axis Value | `ns=4;i=12` |
| X Axis Feed | `ns=4;i=14` |
| Z Axis Feed | `ns=4;i=15` |
| Tool Number | `ns=4;i=13` |
| Tool Temperature | `ns=4;i=19` |
| Tool Vibration | `ns=4;i=21` |
| Spindle Temperature | `ns=4;i=20` |
| Spindle Vibration | `ns=4;i=22` |
| Spindle Speed | `ns=4;i=24` |
| Pneumatic Chuck State | `ns=4;i=23` |

#### Station Light Tower
| Color | Node ID |
|-------|---------|
| Red LED | `ns=4;i=8` |
| Yellow LED | `ns=4;i=9` |
| Green LED | `ns=4;i=10` |

#### Control Registers (Commands)
| Command | Node ID |
|---------|---------|
| Cycle Start | `ns=4;i=16` |
| Cycle Stop | `ns=4;i=17` |
| Remote Cycle Start | `ns=4;i=82` |
| Remote Cycle Stop | `ns=4;i=93` |
| Remote Cycle Reset | `ns=4;i=104` |

---

## 4. Connection Management

The Python `asyncua.sync.Client` wrapper is used for communication.
- Ensure that you use synchronous methods like `client.get_node()` and `node.read_value()` since the `opcua_driver.py` provides a thread-safe synchronous wrapper over the asynchronous `asyncua` library (specifically needed for `asyncua >= 1.0.x`).
- The connection is robust, and logs from `asyncua.client.client` are suppressed in `api/main.py` because the PLC forces frequent timeout warnings which are normal and harmless.
