# BVM Control System Frontend

The frontend for the BVM Control System is a modern, responsive web application built to monitor and control industrial hardware systems (ASRS, Hydraulics) and manage e-commerce fulfillment. 

## Tech Stack
- **Framework:** React + Vite
- **Styling:** Custom CSS Variables (Warm Industrial Theme), Tailwind CSS (for layout utilities)
- **State & Data:** Custom hooks, Context API, REST API integration
- **Real-time:** WebSockets for live status updates

## Key Features & Implemented Sections

### 1. ASRS Dashboard (`/asrs/dashboard`)
A comprehensive view of the Automated Storage and Retrieval System.
- Visual grid representing storage subcompartments.
- Real-time status indicators (Occupied, Empty, Error) updated via WebSockets.
- Operations panel to trigger "Add Product" and "Retrieve Product" sequences.

### 2. ASRS Operations & Tracking (`/asrs/operations`, `/asrs/transactions`)
- **Operations:** Form-based tools to command the physical ASRS hardware (e.g., storing a specific item in a designated slot).
- **Transactions Log:** Detailed history of all insertions, retrievals, and system movements for audit purposes.

### 3. Ecommerce Application (`/ecommerce`)
A user-facing portal and administrative backend for order management.
- **Configurator:** Guided step-by-step selection for customized assemblies (Bearing → Housing → Shaft).
- **Cart & Selection:** Review customized products before submitting the order.
- **Admin Dashboard:** View incoming orders, update fulfillment statuses, and track inventory allocation from the ASRS.

### 4. Admin & User Management (`/admin`)
- Interface for managing system users, access roles, and broad system configurations.

## Development Setup

### Installation
Ensure you have Node.js installed, then run:

```bash
cd frontend
npm install
```

### Running the Development Server
```bash
npm run dev
```
This will start the Vite dev server, typically accessible at `http://localhost:5173`.

### Theming
The project uses a custom "Warm Industrial" CSS variable design system defined in `src/index.css`. This avoids heavy reliance on external component libraries, resulting in a highly customized, hardware-centric aesthetic.
