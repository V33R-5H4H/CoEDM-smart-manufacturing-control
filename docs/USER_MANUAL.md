# CoEDM Smart Manufacturing — Operator Manual

> **Platform Status (July 2026):**
> - **Live Hardware:** ASRS, Assembly Press, MIRAC CNC, TRIAC CNC
> - **Simulated (Frontend Only):** AMR, Cobot, Testing/Inspection Station
> - **Access:** HMI Dashboard at `http://localhost:5173` | API Swagger at `http://localhost:8000/docs`

This manual provides step-by-step instructions for operating the CoEDM Smart Manufacturing platform — both as a factory floor operator and as an e-commerce admin.

---

## Chapter 1: E-Commerce Customer Experience

This section outlines how customers can use the E-Commerce storefront to browse products, place manufacturing orders, and track their production status in real-time.

### 1.1 Account Creation & Logging In
Before placing an order, you must create an account on the e-commerce portal.
1. Navigate to the E-Commerce Storefront at `http://localhost:81` (or the server IP if accessed remotely).
2. Click **Login / Register** in the top navigation bar.
3. Switch to **Sign Up**, enter your Name, Email, and Password, then submit.
4. Once registered, log in to access the Catalogue and your Order History.

### 1.2 Browsing the Catalogue
1. Click on **Catalogue** in the top navigation.
2. Here you will see a list of customizable products available for manufacturing (e.g., CNC Machined Blocks, Assembled Pistons).
3. Click on a product to view its details, including pricing, estimated manufacturing time, and available customization options (like material type or engraved text).

### 1.3 Placing a Manufacturing Order
1. From the product details page, select your desired customizations and click **Add to Cart**.
2. When you are ready to order, click the **Cart** icon in the top right and select **Checkout**.
3. Review your order details.
4. Click **Confirm Order**. 
5. The system will process your request and immediately send a **Manufacturing Job** directly into the factory's production queue. You will receive an **Order ID**.

### 1.4 Tracking Order Status
The CoEDM platform provides live updates from the factory floor.
1. Navigate to **My Orders** from the top menu.
2. Find your specific order by its **Order ID**.
3. Current live statuses:
   - **Pending:** Order received, waiting to be processed.
   - **Processing:** ASRS retrieval in progress — the compartment is reserved and the shuttle is being commanded.
   - **Completed:** Item physically retrieved from ASRS and ready for dispatch.
   - **Cancelled / Failed:** Retrieval was attempted but failed (e.g., PLC connection lost).

---

## Chapter 2: E-Commerce Admin Workflow

This section is dedicated to E-Commerce Store Administrators. It explains how to monitor incoming customer orders and manage users.

### 2.1 Accessing the Admin Dashboard
1. Log into the E-Commerce storefront with an Admin-level account. (Note: Only system administrators can upgrade standard users to Admin via the backend console).
2. Once logged in, a new **Admin Panel** link will appear in your top navigation bar.
3. Click it to enter the E-Commerce Admin Dashboard.

### 2.2 Viewing the Global Order List
1. In the Admin Dashboard, navigate to the **Orders** section.
2. Here, you will see a master list of all orders placed by all customers globally.
3. The dashboard displays critical details for each order:
   - **Customer Email**
   - **Order ID**
   - **Total Price**
   - **Current Status** (Pending, Processing, Completed, etc.)
4. You can filter or search for specific orders if a customer calls in for support.

### 2.3 How Orders Enter the Factory
The CoEDM platform bridges the gap between digital storefronts and physical manufacturing seamlessly.
- **Instant Synchronization:** When a customer clicks "Confirm Order," the E-Commerce backend validates the payment and order details.
- **Factory Queueing:** Once validated, the order is injected directly into the **PostgreSQL Production Database** used by the factory. 
- **No Manual Handoff:** There is no need for an admin to approve or manually send orders to the factory floor. The factory's centralized control system constantly polls the database and will automatically trigger the ASRS and AMRs to begin manufacturing the next pending order in the queue.

---

## Chapter 3: Factory Dashboard — Main Overview & ASRS

This chapter is intended for Lab Operators managing the physical factory floor. The Admin Dashboard is the central command center for the entire manufacturing line.

### 3.1 Accessing the Factory Dashboard
1. Open a browser and navigate to `http://localhost:5173` (or the server IP if accessed remotely).
2. The **Main Overview** page shows 4 station cards (ASRS, Assembly, MIRAC, TRIAC) with status badges and key metrics.

> **Note:** Dashboard metric cards currently show last-known values. The ASRS, Assembly, MIRAC, and TRIAC station pages show live real-time data via WebSocket.

### 3.2 ASRS (Automated Storage & Retrieval System) Operations
Click on the **ASRS** tab in the sidebar to enter the inventory and shuttle control page.

#### Reading the Inventory Grid
- The dashboard shows the live 5×7 LED grid (boxes A1–E7).
- Each box has 6 sub-compartments (a–f) visible in the **Box Detail Modal** (click any box).
- **LED Off (grey):** Shuttle idle at this slot
- **LED On (amber):** Shuttle currently moving to/from this box
- **LED Flash (green→off):** Operation just completed

#### Manual Store / Retrieve Commands
If you need to manually override the system (e.g., restocking raw materials):
1. In the ASRS page, use the command buttons: **Store**, **Retrieve**, or **Home**.
2. For box-specific commands, type the box address (e.g., `A3`) and select Store or Retrieve.
3. The PLC command (Boolean pulse on `ns=4, s=A3S` or `ns=4, s=A3R`) is sent immediately.
4. Monitor the LED grid — the target box LED lights amber during shuttle motion and turns off on completion.

> [!CAUTION]
> Always ensure the physical safety light curtain is clear before executing manual commands. A curtain interruption will generate an alarm event and a browser notification.

---

## Chapter 4: Factory Dashboard — Assembly Press

This chapter covers the hydraulic assembly press station.

### 4.1 Hydraulic Press Monitoring
Click on the **Assembly** tab in the sidebar. The page shows:
- **Animated piston cylinder visualization** — smooth spring-interpolated movement following actual `displacement_mm` from the PLC
- **Vice state** — Open / Closed
- **Stack light LEDs** — Red / Yellow / Green matching the physical stack light on the press
- **Safety curtain status** — with edge-triggered alarm toast notification on interruption
- **Canvas graph** — real-time displacement history (raw + spring-smoothed)

### 4.2 Assembly Commands
Issue commands from the bottom control bar:

| Button | OPC-UA Write | Effect |
|--------|-------------|--------|
| **Bearing ON** | BEARING_ON = True, SHAFT_ON = False | Piston extends for bearing press |
| **Shaft ON** | SHAFT_ON = True, BEARING_ON = False | Piston extends for shaft press |
| **Vice Open** | Relay3 = True | Opens the pneumatic vice jaws |
| **Vice Close** | Relay4 = True | Closes the pneumatic vice jaws |

> [!CAUTION]
> Always ensure no hands or objects are under the press head before issuing BEARING_ON or SHAFT_ON commands. BEARING_ON and SHAFT_ON are mutually exclusive — the system enforces this in software.

### 4.3 AMR & Cobot Monitoring & Control

> [!NOTE]
> The `/amr` and `/cobot` pages display live hardware telemetry and operational status. The AMR (`10.10.14.122:502`) and Cobot (`10.10.14.106:5890`) are fully integrated and actively communicating over Modbus TCP and raw TCP/TMSCT protocols respectively.

---

## Chapter 5: Factory Dashboard — CNC Machining & Alarms

This chapter covers the operation and monitoring of the heavy machining centers (Mirac and Triac CNCs), as well as general alarm management for the entire factory.

### 5.1 CNC Monitoring (Mirac / Triac)
Click on the **Mirac CNC** or **Triac CNC** tab in the sidebar. These stations require the highest level of supervision due to the physical hazards involved in milling and turning.

#### Reading Telemetry
The dashboard provides a digital twin of the CNC machine's critical sensors:
- **Spindle State:** Live RPM, Spindle Temperature, and Spindle Vibration.
- **Tool State:** Current Tool Number, Tool Temperature, and Tool Vibration.
- **Axes:** Live X and Z axis values (position) and feed rates.
- **Light Tower:** The digital representation of the physical Red/Yellow/Green light tower on top of the machine.

### 5.2 Remote CNC Commands
While the CNCs usually run automatically as part of the queue, operators have remote control capabilities.
> [!CAUTION]
> Always ensure the physical CNC doors are locked and the safety perimeter is clear before executing remote commands.

1. **Remote Cycle Start:** Triggers the PLC to begin the loaded G-Code program.
2. **Remote Cycle Stop:** Safely halts the current operation (Feed Hold).
3. **Remote Reset:** Clears soft alarms on the machine controller.

### 5.3 Alarm Management & Troubleshooting
If any machine faults (e.g., ASRS jam, CNC tool break, AMR blocked), the system will trigger an alarm.

#### Identifying Alarms
- The **Main Overview** page will flash a red banner indicating the faulted station.
- Navigate to the specific station's tab to read the error code and description.
- Common Alarms:
  - `ASRS_JAM`: The crane failed to engage the crate.
  - `AMR_BLOCKED`: An obstacle is in the robot's path.
  - `CNC_VIB_HIGH`: Tool vibration exceeded the safety threshold.

#### Clearing Faults (Standard Operating Procedure)
1. **Identify and Secure:** Physically go to the faulted station. Press the physical E-Stop if the situation is unsafe.
2. **Resolve the Issue:** Clear the jam, remove the obstacle, or replace the broken tool.
3. **Reset Hardware:** Release the physical E-Stop and press the physical Reset button on the machine's control panel.
4. **Software Acknowledge:** Return to the dashboard. Click the **Acknowledge / Reset Alarm** button on the station's tab. The light tower should turn from Red to Green or Yellow.
5. **Resume:** The central dispatcher will automatically resume the queue once the station reports a healthy state.

---
**End of User Manual**
