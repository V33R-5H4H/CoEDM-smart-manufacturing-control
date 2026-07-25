# CoEDM Smart Manufacturing - User Manual

This manual provides step-by-step instructions for operating the CoEDM Smart Manufacturing platform. It is designed for customers placing orders, as well as factory operators monitoring the physical hardware via the dashboard.

---

## Chapter 1: E-Commerce Customer Experience

This section outlines how customers can use the E-Commerce storefront to browse products, place manufacturing orders, and track their production status in real-time.

### 1.1 Account Creation & Logging In
Before placing an order, you must create a customer account.
1. Navigate to the E-Commerce Storefront (usually `http://<server-ip>:81`).
2. Click on the **Login / Register** button in the top navigation bar.
3. If you are a new user, switch to the **Sign Up** tab, enter your details (Name, Email, Password), and submit.
4. Once registered, log in with your credentials to access the Catalogue and your personal Order History.

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
The CoEDM platform provides live updates directly from the factory floor to your screen.
1. Navigate to the **Order Tracking** or **My Orders** page from the top menu.
2. Find your specific order by its **Order ID**.
3. You will see the current live status of your item as it moves through the automated line:
   - **Pending:** Order received, waiting in the digital queue.
   - **ASRS Retrieval:** The raw material is being fetched from storage.
   - **AMR Transit:** A robot is transporting the material.
   - **Machining/Assembly:** The item is actively being manufactured.
   - **Inspection:** The item is undergoing quality control.
   - **Completed:** The item is finished and ready for dispatch.
   - **Rejected:** The item failed inspection and has been routed to the scrap bin.

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
1. Open a browser on a lab computer and navigate to the dashboard URL (usually `http://<server-ip>:3000`).
2. You will be greeted by the **Main Overview** page, which gives a bird's-eye view of the factory's health, active alarms, and the production queue.

### 3.2 The Live Production Queue
On the left side of the Main Overview, you will find the Live Production Queue.
- This queue pulls directly from the PostgreSQL database, showing orders placed via the E-Commerce store.
- **Queue Logic:** The central dispatcher automatically assigns the top-most "Pending" job to an available AMR and the ASRS. 
- You can monitor the live state of every active job as it progresses through the line.

### 3.3 ASRS (Automated Storage & Retrieval System) Operations
Click on the **ASRS** tab in the sidebar to enter the inventory management screen.

#### Reading the Inventory View
- The dashboard provides a visual map of the physical rack.
- Each box slot can contain a crate with up to **6 sub-compartments** (A to F).
- **Empty:** Gray slots.
- **Occupied:** Blue slots indicating raw material is present.
- **Reserved:** Orange slots indicating an active order is claiming that material.

#### Manual Store / Retrieve Commands
If you need to manually override the system (e.g., restocking raw materials):
1. Click on a specific Box slot on the visual map.
2. An **Operations Panel** will slide up from the bottom.
3. Select a specific sub-compartment (A-F).
4. **To Store:** Select "Execute Store". The physical ASRS crane will pick up the box at the loading bay and store it in the designated slot.
5. **To Retrieve:** Select "Execute Retrieve". The crane will fetch the box and bring it to the loading bay.
6. Always ensure the physical safety light curtains are clear before executing manual commands, or the operation will be blocked by the safety PLC.

---

## Chapter 4: Factory Dashboard — AMR & Assembly Control

This chapter covers the mobile robots and the static assembly station.

### 4.1 AMR (Autonomous Mobile Robot) Fleet Monitoring
Click on the **AMR Fleet** tab in the sidebar. This page connects directly to the AMR Fleet Manager.

#### Monitoring Robot Status
- **Robot State:** See if the AMR is Idle, Navigating, Charging, or Faulted.
- **Battery Level:** A live percentage is shown. If the battery drops below the critical threshold, the robot will automatically navigate to its charging dock.
- **Location:** The dashboard displays the robot's current (X, Y) coordinates relative to the lab map.

#### Dispatching AMRs (Manual Override)
Normally, AMRs are dispatched automatically by the central order queue. However, an operator can manually dispatch a robot if necessary:
1. Select an idle AMR from the list.
2. Choose a destination from the drop-down menu (e.g., "ASRS Loading Bay", "Hydraulic Press", "CNC Station").
3. Click **Dispatch**. The AMR will calculate its path and begin moving.

### 4.2 Assembly & Inspection Station
Click on the **Assembly** tab in the sidebar. This station typically handles hydraulic pressing, riveting, or final vision inspection.

#### Monitoring the Hydraulic Press
- The dashboard shows the live telemetry from the assembly PLC.
- **Press State:** Moving Up, Moving Down, Idle, or Faulted.
- **Pressure Sensor:** Real-time hydraulic pressure readout (if equipped).

#### Vision Inspection Results
Once an item is assembled, it moves to the inspection camera.
- The dashboard will display the result of the last scanned item: **Pass** or **Fail**.
- Failed items are automatically routed by the conveyor to the Scrap/Rework bin.
- Operators can view a counter of Total Passed vs. Total Failed items for the day to monitor yield rates.

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
