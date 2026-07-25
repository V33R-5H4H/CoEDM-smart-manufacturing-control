# CoEDM Smart Manufacturing Control - Setup & Deployment Guide

This guide covers everything required to set up the CoEDM Smart Manufacturing Control system for local development, as well as instructions for deploying it to a production server using Docker and GitHub Actions.

## 1. System Architecture
The platform is composed of four main services:
- **Database (`db`)**: PostgreSQL with the TimescaleDB extension (for time-series sensor data). Exposed locally on `5432`.
- **Backend (`backend`)**: FastAPI server handling REST endpoints, WebSockets, and direct OPC-UA/Modbus/TCP communication with the lab machines. Exposed on `8000`.
- **Admin Frontend (`frontend`)**: React/Vite dashboard for lab operators to monitor and control the ASRS and other machines. Exposed on `3000` (or `80` in prod).
- **E-Commerce Storefront (`ecom`)**: React/Vite storefront for customers to place orders directly into the manufacturing queue. Exposed on `81` (or `80` in prod).

---

## 2. Prerequisites
Whether running locally or in production, you must have the following installed:
- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) (v2+)
- (Local Only) [Node.js](https://nodejs.org/en/) (v18+)
- (Local Only) [Python](https://www.python.org/downloads/) (3.10+)

---

## 3. Local Development Setup
For active development, you generally want to run the database via Docker, but run the Backend, Frontend, and Ecom services natively on your host machine to benefit from hot-reloading.

### 3.1 Start the Local Database
```bash
docker run --name pg_test_db \
  -e POSTGRES_USER=coedm \
  -e POSTGRES_PASSWORD=coedm_password \
  -e POSTGRES_DB=coedm \
  -p 5432:5432 \
  -d timescale/timescaledb:latest-pg16
```

> [!NOTE]
> Run the schema initialization script manually if you are starting from a fresh database: `docker exec -i pg_test_db psql -U coedm -d coedm < backend/database/Integrated_Schema_v2.sql`

### 3.2 Backend Setup
1. Open a terminal and navigate to the root directory.
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   # On Windows:
   .venv\Scripts\activate
   # On Linux/Mac:
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `backend/` directory:
   ```ini
   DATABASE_URL=postgresql://coedm:coedm_password@localhost:5432/coedm
   AMR_HOST=10.10.14.122
   AMR_PORT=5000
   ```
5. Run the server:
   ```bash
   uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
   ```

### 3.3 Frontend & E-Commerce Setup
For both the `frontend` and `ecom` directories:
1. Open a new terminal for each.
2. Navigate to the directory (`cd frontend` or `cd ecom`).
3. Install dependencies: `npm install`
4. Start the dev server: `npm run dev`

---

## 4. Production Deployment (Docker Compose)
To deploy the entire stack to a physical server (like the `xenserver`), we use Docker Compose to containerize all four services.

### 4.1 Clone and Configure
1. SSH into the server and clone the repository:
   ```bash
   git clone https://github.com/V33R-5H4H/CoEDM-smart-manufacturing-control.git ~/coedm-prod
   cd ~/coedm-prod
   ```
2. Create the production environment file (`.env.docker`) in the root directory `~/coedm-prod`:
   ```ini
   # Database Configuration
   POSTGRES_USER=coedm
   POSTGRES_PASSWORD=secure_password_here
   POSTGRES_DB=coedm
   DATABASE_URL=postgresql://coedm:secure_password_here@db:5432/coedm

   # Hardware IP Configuration
   AMR_HOST=10.10.14.122
   AMR_PORT=5000
   
   # Add all other OPC-UA and Modbus URLs here...
   ```

> [!CAUTION]
> The `.env.docker` file contains sensitive passwords and should **never** be committed to Git. Keep it securely on the server.

### 4.2 Build and Start Services
Run the following commands to build the images and start the stack in detached mode:
```bash
docker compose -p coedm-prod build --no-cache
docker compose -p coedm-prod up -d
```
The services will now be running on:
- Admin Dashboard: `http://<server-ip>:3000`
- Ecom Store: `http://<server-ip>:81`
- Backend API: `http://<server-ip>:8000/docs`

---

## 5. CI/CD Pipeline (GitHub Actions)
The repository is configured to automatically test and deploy code when changes are merged into the `main` branch.

### 5.1 Branch Protection
- Direct pushes to the `main` branch are **rejected**.
- You must create a new branch (e.g., `feature-xyz`), push it, and open a **Pull Request** on GitHub.
- Merging the Pull Request triggers the deployment.

### 5.2 How the Pipeline Works
The `.github/workflows/ci.yml` file defines the pipeline, which runs on a **self-hosted runner** located on the `xenserver`.
1. **Lint & Build**: Checks the React code in both frontend directories.
2. **Test Database**: Spins up a temporary PostgreSQL instance on port `5433`.
3. **Pytest**: Runs the backend Python tests against the temporary database.
4. **Deploy**: If all tests pass, it runs `docker compose build` and `docker compose up -d` directly on the server to apply the new changes.

> [!IMPORTANT]
> The GitHub Action requires the `.env.docker` file to be present in `~/coedm-prod` on the server so it can copy it into the Action's workspace during deployment.

---

## 6. Common Operations & Troubleshooting

**View Backend Logs:**
```bash
docker logs -f coedm_backend
```

**Restart After Environment Changes:**
If you change `.env.docker`, you must restart the stack:
```bash
docker compose -p coedm-prod down
docker compose -p coedm-prod up -d
```

**Database Connection Errors:**
If the backend throws `[Errno 10061] Connect call failed`, ensure your local development machine is on the same physical network or VPN as the lab machines (the `10.10.14.x` subnet).

**Make a User an Admin (E-commerce):**
To upgrade a user to superuser access for the E-commerce admin panel, run this on the server:
```bash
cd ~/coedm-prod
docker exec -it coedm_backend python scripts/make_ecom_admin.py admin@example.com
```
