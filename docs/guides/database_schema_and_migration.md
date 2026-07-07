# Database Schema and Migration Guide

This guide details the database architecture of the CoEDM Smart Manufacturing Control platform, how it integrates with TimescaleDB, and how to manage schema migrations.

## 1. Overview
The platform uses **PostgreSQL** extended with **TimescaleDB**. 
The database serves two primary purposes:
1. **Relational State Management**: Tracking users, machines, inventory, ASRS compartments, and e-commerce orders.
2. **Time-Series Telemetry**: High-frequency data ingestion from OPC-UA and Modbus sensors across the CNC and Assembly machines.

The master schema definition is located at `backend/database/Integrated_Schema_v2.sql`.

---

## 2. Core Schema Entities

### 2.1 Machines and Sensors
- `machines`: The root table. Every hardware station (ASRS, MIRAC, TRIAC, Assembly, AMR, Cobot) is registered here. All other tables trace back to this table via `machine_id`.
- `machine_sensors`: Represents the PLCs, VIBITs, and energy meters attached to a specific machine.
- `machine_connections`: Tracks the history of when sensors connect and disconnect.

### 2.2 Inventory and ASRS
- `storage_items`: The item master catalog (raw materials, finished goods, tools, consumables). Contains pricing and image URLs for the e-commerce storefront.
- `storage_boxes`: The 35 physical crates in the ASRS (Row A-E, Col 1-7).
- `storage_compartments`: The 210 sub-slots (6 per box). Tracks `status` (empty, occupied, reserved) and `quantity`.
- `retrieval_queue`: A FIFO job queue for ASRS retrieval requests.
- `storage_transactions`: An append-only log of all inventory movements.
- `shuttle_movements`: Real-time status of the ASRS shuttle mechanisms.

### 2.3 E-Commerce and Orders
- `users`: Stores customer and admin accounts with bcrypt password hashes.
- `orders`: High-level customer order state (`pending`, `processing`, `shipped`, `cancelled`).
- `order_items`: The line items for an order, linked directly to `storage_items`.

### 2.4 Time-Series Data (TimescaleDB)
The following tables are implemented as TimescaleDB **Hypertables** to handle massive data ingest efficiently:
- `mirac_sensor_data`: 3-axis CNC telemetry, spindle speed, temp, and tool data.
- `triac_sensor_data`: Mill telemetry (placeholder for future use).
- `vibit_readings`: High-resolution vibration data (RMS, Peak, Temp).
- `energy_meter_data`: Power consumption and line voltages.
- `assembly_station_data`: State changes of the hydraulic press and vice.
- `amr_sensor_data`: AMR navigation and battery state.
- `cobot_sensor_data`: TM Robot joint angles and TCP forces.

---

## 3. Views
To simplify complex queries, the schema provides operational views:
- `v_machine_status`: Live overview of all machines and their sensor counts.
- `v_shuttle_state`: Extracts the absolute latest state of the ASRS shuttle.
- `v_asrs_inventory`: A complete map of all ASRS compartments joined with their item details.
- `v_active_sensors`: A flattened view of all actively connected sensors.

---

## 4. Managing Migrations

We manage database schema changes using plain SQL migration files located in `backend/database/migrations/`. 

> **Important:** This project currently uses a manual SQL-file-based approach for migrations rather than a complex ORM tool like Alembic, keeping deployment simple and deterministic.

### 4.1 Creating a Migration
If you need to alter a table or add new columns:
1. Create a new `.sql` file in the `backend/database/migrations/` directory.
2. Follow the naming convention: `[category]_[number]_[description].sql`
   - Example: `ecom_004_add_shipping_notes.sql`
3. Write your `ALTER TABLE` statements inside. 
   - **Best Practice:** Make your migrations idempotent (e.g., check `IF NOT EXISTS` or check `information_schema.columns` before altering) so they can be run multiple times safely.

*Example of an idempotent column addition (from ecom_001):*
```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='orders' AND column_name='shipping_notes'
    ) THEN
        ALTER TABLE orders ADD COLUMN shipping_notes TEXT;
    END IF;
END $$;
```

### 4.2 Applying Migrations
During a fresh deployment, the primary schema `Integrated_Schema_v2.sql` is loaded first. 
Then, any subsequent migrations should be run against the database.

**To run migrations locally (using Docker):**
```bash
docker exec -i coedm_db psql -U coedm -d coedm < backend/database/migrations/ecom_001_add_price_and_auth.sql
```

**To run them directly on the production server:**
```bash
cd ~/coedm-prod
cat backend/database/migrations/*.sql | docker exec -i coedm_db psql -U coedm -d coedm
```

### 4.3 Updating the Base Schema
Once a migration is successfully tested and deployed, you should eventually "bake" it into the master `Integrated_Schema_v2.sql` file so that fresh deployments don't need to run a massive chain of migration scripts. 

When you do this, you can leave the migration script in the `migrations` folder for historical reference, but future deployments will get the new schema layout directly from the master file.
